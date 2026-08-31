import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { copyFile, stat } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { basename, extname, join, resolve } from "node:path";

export type CodexCliProvider = {
  id: string;
  name?: string;
  baseUrl: string;
  apiKeyEnv: string;
  supportsWebSockets?: boolean;
};

export type CodexCliConfig = {
  version?: 1;
  enabled?: boolean;
  model?: string;
  serviceTier?: "fast" | "flex";
  provider?: CodexCliProvider;
};

export type CodexCliTraceEvent = {
  invocationId: string;
  at: string;
  stage: "starting" | "event" | "completed" | "failed";
  message: string;
  eventType?: string;
};

export type StructuredModelArtifact = {
  kind:
    | "request"
    | "input_image"
    | "output_schema"
    | "event_stream"
    | "model_output"
    | "stderr"
    | "stdout_raw"
    | "stderr_raw"
    | "metadata";
  path: string;
  contentHash: string;
  byteLength: number;
};

export type StructuredModelRequest = {
  invocationId: string;
  prompt: string;
  outputSchema: Record<string, unknown>;
  imagePaths?: string[];
  signal?: AbortSignal;
};

export type StructuredModelResponse = {
  output: unknown;
  artifacts: StructuredModelArtifact[];
  durationMs: number;
};

export type CodexCliStructuredModelOptions = {
  artifactDirectory: string;
  workingDirectory: string;
  config?: CodexCliConfig;
  executable?: string;
  timeoutMs?: number;
  onTrace?: (event: CodexCliTraceEvent) => void;
};

export class CodexCliInvocationError extends Error {
  readonly artifacts: StructuredModelArtifact[];

  constructor(message: string, artifacts: StructuredModelArtifact[]) {
    super(message);
    this.name = "CodexCliInvocationError";
    this.artifacts = artifacts;
  }
}

export function validateCodexCliConfig(value: unknown): CodexCliConfig {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new TypeError("Codex 配置必须是 JSON 对象");
  if (value.version !== undefined && value.version !== 1)
    throw new TypeError("仅支持 version: 1 的 Codex 配置");
  if (value.enabled !== undefined && typeof value.enabled !== "boolean")
    throw new TypeError("enabled 必须是布尔值");
  const model = optionalString(value.model, "model");
  const serviceTier = value.serviceTier;
  if (serviceTier !== undefined && serviceTier !== "fast" && serviceTier !== "flex")
    throw new TypeError("serviceTier 只能是 fast 或 flex");
  const provider = value.provider === undefined ? undefined : validateProvider(value.provider);
  return {
    ...(value.enabled !== undefined ? { enabled: value.enabled } : {}),
    ...(model ? { model } : {}),
    ...(serviceTier ? { serviceTier } : {}),
    ...(provider ? { provider } : {}),
  };
}

export async function invokeCodexCliStructured(
  options: CodexCliStructuredModelOptions,
  request: StructuredModelRequest,
): Promise<StructuredModelResponse> {
  const config = validateCodexCliConfig(options.config);
  const startedAt = Date.now();
  const runDirectory = invocationDirectory(options.artifactDirectory, request.invocationId);
  const schemaPath = join(runDirectory, "output-schema.json");
  const requestPath = join(runDirectory, "request.json");
  const outputPath = join(runDirectory, "last-message.json");
  const eventsPath = join(runDirectory, "events.jsonl");
  const stdoutRawPath = join(runDirectory, "stdout.raw");
  const stderrPath = join(runDirectory, "stderr.log");
  const stderrRawPath = join(runDirectory, "stderr.raw");
  const metadataPath = join(runDirectory, "metadata.json");
  const inputDirectory = join(runDirectory, "input-images");
  const candidates: ArtifactCandidate[] = [
    ["request", requestPath],
    ["output_schema", schemaPath],
    ["event_stream", eventsPath],
    ["stdout_raw", stdoutRawPath],
    ["model_output", outputPath],
    ["stderr", stderrPath],
    ["stderr_raw", stderrRawPath],
    ["metadata", metadataPath],
  ];

  mkdirSync(inputDirectory, { recursive: true });
  const copiedImages = await copyInputImages(request.imagePaths || [], inputDirectory, candidates);
  writeFileSync(schemaPath, `${JSON.stringify(request.outputSchema, null, 2)}\n`, "utf8");
  writeFileSync(
    requestPath,
    `${JSON.stringify({
      invocationId: request.invocationId,
      prompt: request.prompt,
      inputImages: copiedImages.map((file) => basename(file)),
    }, null, 2)}\n`,
    "utf8",
  );

  const args = commandArguments({ config, schemaPath, outputPath, runDirectory, imagePaths: copiedImages });
  const invocation = codexInvocation(options.executable, args);
  const trace = (event: Omit<CodexCliTraceEvent, "invocationId" | "at">) =>
    options.onTrace?.({ invocationId: request.invocationId, at: new Date().toISOString(), ...event });
  trace({
    stage: "starting",
    message: `启动 Codex CLI：${invocation.displayCommand}`,
  });

  try {
    if (config.provider && !process.env[config.provider.apiKeyEnv])
      throw new Error(`未设置第三方供应商密钥环境变量：${config.provider.apiKeyEnv}`);
    const processResult = await runCodexProcess({
      command: invocation.command,
      args: invocation.args,
      cwd: options.workingDirectory,
      env: invocation.env,
      input: request.prompt,
      eventsPath,
      stdoutRawPath,
      stderrPath,
      stderrRawPath,
      outputEncoding: "utf-8",
      timeoutMs: options.timeoutMs ?? 180_000,
      signal: request.signal,
      onEvent: (event) => {
        const eventType = isRecord(event) && typeof event.type === "string" ? event.type : undefined;
        trace({
          stage: "event",
          eventType,
          message: eventType ? `Codex 事件：${eventType}` : "收到 Codex 事件",
        });
      },
    });
    const output = JSON.parse(readFileSync(outputPath, "utf8")) as unknown;
    const durationMs = Date.now() - startedAt;
    writeMetadata(metadataPath, {
      status: "completed",
      startedAt: new Date(startedAt).toISOString(),
      durationMs,
      exitCode: processResult.exitCode,
      executable: invocation.displayCommand,
      args: redactArguments(args),
    });
    trace({ stage: "completed", message: `Codex 调用完成，用时 ${durationMs}ms` });
    return { output, artifacts: await collectArtifacts(candidates), durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : "Codex CLI 调用失败";
    writeMetadata(metadataPath, {
      status: "failed",
      startedAt: new Date(startedAt).toISOString(),
      durationMs,
      error: message,
      executable: invocation.displayCommand,
      args: redactArguments(args),
    });
    trace({ stage: "failed", message });
    throw new CodexCliInvocationError(message, await collectArtifacts(candidates));
  }
}

type ArtifactCandidate = [kind: StructuredModelArtifact["kind"], file: string];

async function copyInputImages(
  imagePaths: string[],
  inputDirectory: string,
  candidates: ArtifactCandidate[],
) {
  const copied: string[] = [];
  for (const [index, source] of imagePaths.entries()) {
    if (!existsSync(source)) throw new Error(`输入图片不存在：${source}`);
    const extension = extname(source) || ".png";
    const target = join(inputDirectory, `${index + 1}${extension}`);
    await copyFile(source, target);
    copied.push(target);
    candidates.push(["input_image", target]);
  }
  return copied;
}

function commandArguments(input: {
  config: CodexCliConfig;
  schemaPath: string;
  outputPath: string;
  runDirectory: string;
  imagePaths: string[];
}) {
  const args = [
    "exec",
    ...providerArguments(input.config.provider),
    ...(input.config.serviceTier ? ["--config", `service_tier=${tomlString(input.config.serviceTier)}`] : []),
    ...(input.config.model ? ["--model", input.config.model] : []),
    "--sandbox", "read-only",
    "--cd", input.runDirectory,
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "--output-schema", input.schemaPath,
    "--output-last-message", input.outputPath,
    "--color", "never",
    "--json",
    "--ephemeral",
  ];
  for (const imagePath of input.imagePaths) args.push("--image", imagePath);
  args.push("-");
  return args;
}

function providerArguments(provider?: CodexCliProvider): string[] {
  if (!provider) return [];
  const prefix = `model_providers.${provider.id}`;
  return [
    "--config", `model_provider=${tomlString(provider.id)}`,
    "--config", `${prefix}.name=${tomlString(provider.name || provider.id)}`,
    "--config", `${prefix}.base_url=${tomlString(provider.baseUrl)}`,
    "--config", `${prefix}.env_key=${tomlString(provider.apiKeyEnv)}`,
    "--config", `${prefix}.wire_api=\"responses\"`,
    "--config", `${prefix}.requires_openai_auth=false`,
    "--config", `${prefix}.supports_websockets=${provider.supportsWebSockets ?? false}`,
  ];
}

function codexInvocation(executable: string | undefined, args: string[]) {
  const override = executable || process.env.DOCKYARD_CODEX_COMMAND;
  const candidates = [
    override,
    process.env.APPDATA && join(process.env.APPDATA, "npm", "codex.cmd"),
    process.env.APPDATA && join(process.env.APPDATA, "npm", "codex.ps1"),
    process.env.PNPM_HOME && join(process.env.PNPM_HOME, "codex.cmd"),
    process.env.PNPM_HOME && join(process.env.PNPM_HOME, "codex.ps1"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "pnpm", "codex.cmd"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "pnpm", "codex.ps1"),
  ].filter((value): value is string => Boolean(value && existsSync(value)));
  const found = candidates[0];
  if (process.platform !== "win32")
    return { command: found || "codex", args, displayCommand: found || "codex" };
  if (found?.toLowerCase().endsWith(".ps1"))
    return {
      command: "powershell.exe",
      args: [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$invocationArgs = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DOCKYARD_CODEX_INVOCATION_ARGS)) | ConvertFrom-Json; & $env:DOCKYARD_CODEX_INVOCATION_SCRIPT @invocationArgs",
      ],
      env: {
        ...process.env,
        DOCKYARD_CODEX_INVOCATION_SCRIPT: found,
        DOCKYARD_CODEX_INVOCATION_ARGS: Buffer.from(JSON.stringify(args), "utf8").toString("base64"),
      },
      displayCommand: found,
    };
  if (found?.toLowerCase().endsWith(".cmd"))
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", found, ...args],
      displayCommand: found,
    };
  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", "codex", ...args],
    displayCommand: "codex",
  };
}

async function runCodexProcess(input: {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  input: string;
  eventsPath: string;
  stdoutRawPath: string;
  stderrPath: string;
  stderrRawPath: string;
  outputEncoding: "utf-8" | "gb18030";
  timeoutMs: number;
  signal?: AbortSignal;
  onEvent: (event: unknown) => void;
}) {
  return new Promise<{ exitCode: number }>((resolvePromise, rejectPromise) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const eventFile = createWriteStream(input.eventsPath, { encoding: "utf8" });
    const stdoutRawFile = createWriteStream(input.stdoutRawPath);
    const stderrFile = createWriteStream(input.stderrPath, { encoding: "utf8" });
    const stderrRawFile = createWriteStream(input.stderrRawPath);
    const stdoutDecoder = new TextDecoder(input.outputEncoding);
    const stderrDecoder = new TextDecoder(input.outputEncoding);
    let buffer = "";
    let stderrTail = "";
    let settled = false;
    let reason: "timeout" | "cancelled" | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", abort);
      eventFile.end();
      stdoutRawFile.end();
      stderrFile.end();
      stderrRawFile.end();
      Promise.all([finished(eventFile), finished(stdoutRawFile), finished(stderrFile), finished(stderrRawFile)]).then(callback, rejectPromise);
    };
    const stop = (value: "timeout" | "cancelled") => {
      reason = value;
      if (process.platform === "win32" && child.pid)
        spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
      else child.kill();
    };
    const abort = () => stop("cancelled");
    const timeout = setTimeout(() => stop("timeout"), input.timeoutMs);
    input.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutRawFile.write(chunk);
      const text = stdoutDecoder.decode(chunk, { stream: true });
      eventFile.write(text);
      buffer += text;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) parseEvent(line, input.onEvent);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = stderrDecoder.decode(chunk, { stream: true });
      stderrRawFile.write(chunk);
      stderrFile.write(text);
      stderrTail = `${stderrTail}${text}`.slice(-2000);
    });
    child.once("error", (error) => finish(() => rejectPromise(error)));
    child.once("close", (code) => {
      const stdoutTail = stdoutDecoder.decode();
      const stderrTailFlush = stderrDecoder.decode();
      if (stdoutTail) {
        eventFile.write(stdoutTail);
        buffer += stdoutTail;
      }
      if (stderrTailFlush) {
        stderrFile.write(stderrTailFlush);
        stderrTail = `${stderrTail}${stderrTailFlush}`.slice(-2000);
      }
      if (buffer) parseEvent(buffer, input.onEvent);
      if (reason === "timeout")
        return finish(() => rejectPromise(new Error(`Codex CLI 超时（${input.timeoutMs}ms）`)));
      if (reason === "cancelled") return finish(() => rejectPromise(new Error("Codex CLI 已取消")));
      if (code === 0) return finish(() => resolvePromise({ exitCode: 0 }));
      const details = sanitizeErrorText(stderrTail);
      finish(() =>
        rejectPromise(
          new Error(
            `Codex CLI 退出码 ${code ?? "unknown"}${details ? `：${details}` : ""}`,
          ),
        ),
      );
    });
    child.stdin.end(input.input);
  });
}

function parseEvent(line: string, onEvent: (event: unknown) => void) {
  if (!line.trim()) return;
  try {
    onEvent(JSON.parse(line) as unknown);
  } catch {
    onEvent({ type: "unparsed", text: line.slice(0, 400) });
  }
}

function validateProvider(value: unknown): CodexCliProvider {
  if (!isRecord(value)) throw new TypeError("provider 必须是对象");
  const id = requiredString(value.id, "provider.id");
  const baseUrl = requiredString(value.baseUrl, "provider.baseUrl");
  const apiKeyEnv = requiredString(value.apiKeyEnv, "provider.apiKeyEnv");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new TypeError("provider.id 格式无效");
  if (["openai", "ollama", "lmstudio"].includes(id.toLowerCase()))
    throw new TypeError(`provider.id 是保留名称：${id}`);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv))
    throw new TypeError("provider.apiKeyEnv 必须是环境变量名");
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new TypeError("provider.baseUrl 无效");
  }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp)
    throw new TypeError("第三方供应商地址必须使用 HTTPS，本机地址除外");
  if (url.username || url.password) throw new TypeError("第三方供应商地址不能包含凭据");
  const name = optionalString(value.name, "provider.name");
  if (value.supportsWebSockets !== undefined && typeof value.supportsWebSockets !== "boolean")
    throw new TypeError("provider.supportsWebSockets 必须是布尔值");
  return {
    id,
    ...(name ? { name } : {}),
    baseUrl: url.toString().replace(/\/$/, ""),
    apiKeyEnv,
    ...(typeof value.supportsWebSockets === "boolean"
      ? { supportsWebSockets: value.supportsWebSockets }
      : {}),
  };
}

function invocationDirectory(root: string, invocationId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(invocationId))
    throw new TypeError("调用标识格式无效");
  const base = resolve(root);
  const directory = resolve(base, `codex-${invocationId}`);
  if (resolve(directory, "..") !== base) throw new TypeError("调用目录越界");
  return directory;
}

async function collectArtifacts(candidates: ArtifactCandidate[]) {
  const artifacts: StructuredModelArtifact[] = [];
  for (const [kind, file] of candidates) {
    if (!existsSync(file)) continue;
    const [content, metadata] = await Promise.all([readFileSync(file), stat(file)]);
    artifacts.push({
      kind,
      path: resolve(file),
      contentHash: createHash("sha256").update(content).digest("hex"),
      byteLength: metadata.size,
    });
  }
  return artifacts;
}

function writeMetadata(path: string, value: Record<string, unknown>) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function redactArguments(args: string[]) {
  return args.map((value) => value.replace(/(api[_-]?key|token|secret)=.+/i, "$1=[REDACTED]"));
}

function sanitizeErrorText(value: string) {
  return value
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/(api[_-]?key|token|secret)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

function tomlString(value: string) {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, name: string) {
  const result = optionalString(value, name);
  if (!result) throw new TypeError(`${name} 必须是非空字符串`);
  return result;
}

function optionalString(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError(`${name} 必须是字符串`);
  return value.trim() || undefined;
}

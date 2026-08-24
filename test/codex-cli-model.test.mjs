import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  invokeCodexCliStructured,
  validateCodexCliConfig,
} from "../dist-electron/codex-cli-model.js";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dockyard-codex-cli-"));
  const script = path.join(root, "fake-codex.ps1");
  const image = path.join(root, "sketch.png");
  await writeFile(
    script,
    "$index = [array]::IndexOf($args, '--output-last-message')\n$output = $args[$index + 1]\nWrite-Output '{\"type\":\"thread.started\"}'\nWrite-Output '{\"type\":\"turn.completed\"}'\n[System.IO.File]::WriteAllText($output, '{\"answer\":\"ok\"}')\n",
    "utf8",
  );
  await writeFile(image, Buffer.from([137, 80, 78, 71]));
  return { root, script, image };
}

test("传入草图、结构约束和第三方供应商后保留完整调用产物", async () => {
  const { root, script, image } = await fixture();
  const traces = [];
  process.env.DOCKYARD_TEST_PROVIDER_KEY = "not-written-to-artifacts";
  const result = await invokeCodexCliStructured(
    {
      artifactDirectory: root,
      workingDirectory: root,
      executable: script,
      config: {
        model: "provider-model",
        provider: {
          id: "test_gateway",
          baseUrl: "https://gateway.example.test/v1",
          apiKeyEnv: "DOCKYARD_TEST_PROVIDER_KEY",
        },
      },
      onTrace: (event) => traces.push(event),
    },
    {
      invocationId: "component-query",
      prompt: "从草图中识别组件",
      imagePaths: [image],
      outputSchema: { type: "object" },
    },
  );

  assert.deepEqual(result.output, { answer: "ok" });
  assert.ok(traces.some((event) => event.eventType === "thread.started"));
  assert.ok(result.artifacts.some((item) => item.kind === "input_image"));
  const run = path.join(root, "codex-component-query");
  const metadata = await readFile(path.join(run, "metadata.json"), "utf8");
  assert.match(metadata, /--image/);
  assert.doesNotMatch(metadata, /not-written-to-artifacts/);
  assert.ok((await readdir(path.join(run, "input-images"))).length === 1);
});

test("拒绝不安全的第三方供应商配置", () => {
  assert.throws(
    () =>
      validateCodexCliConfig({
        provider: {
          id: "openai",
          baseUrl: "https://gateway.example.test",
          apiKeyEnv: "KEY",
        },
      }),
    /保留名称/,
  );
  assert.throws(
    () =>
      validateCodexCliConfig({
        provider: {
          id: "gateway",
          baseUrl: "http://remote.example.test",
          apiKeyEnv: "KEY",
        },
      }),
    /HTTPS/,
  );
});

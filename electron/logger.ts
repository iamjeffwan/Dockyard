import electron from "electron";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const { app } = electron;

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

let logPath: string | null = null;

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(
      /(api[_-]?key|token|secret|password)([=:])[^\s,;]+/gi,
      "$1$2<REDACTED>",
    );
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redact(item)]),
    );
  }
  return value;
}

export function loggerDirectory() {
  const directory = process.env.DOCKYARD_LOG_DIR ||
    (app.isPackaged
      ? join(app.getPath("userData"), "logs")
      : join(process.cwd(), ".tmp", "logs"));
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function initLogger() {
  const directory = loggerDirectory();
  try { app.setAppLogsPath(directory); } catch { /* app may already be ready */ }
  logPath = join(directory, `dockyard-${process.pid}.jsonl`);
  writeLog("info", "logger.initialized", { mode: process.env.NODE_ENV || "development" });
  return { directory, logPath };
}

export function writeLog(level: LogLevel, event: string, context?: LogContext) {
  const path = logPath || join(loggerDirectory(), `dockyard-${process.pid}.jsonl`);
  logPath = path;
  const sanitized = context ? redact(context) as Record<string, unknown> : {};
  const entry = {
    at: new Date().toISOString(),
    pid: process.pid,
    level,
    event,
    ...sanitized,
    process: typeof sanitized.process === "string" ? sanitized.process : "electron-main",
    stage: typeof sanitized.stage === "string" ? sanitized.stage : event.split(".").pop(),
  };
  try {
    appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Logging must never interrupt the application path.
  }
  const line = `[${level.toUpperCase()}] ${event}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function loggerFilePath() {
  return logPath || join(loggerDirectory(), `dockyard-${process.pid}.jsonl`);
}

export function installProcessErrorHandlers() {
  process.on("uncaughtException", (error) => {
    writeLog("error", "process.uncaught_exception", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  });
  process.on("unhandledRejection", (reason) => {
    writeLog("error", "process.unhandled_rejection", {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

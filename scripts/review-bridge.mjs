#!/usr/bin/env node

import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";

const projectRoot = path.resolve(process.env.DOCKYARD_PROJECT_ROOT || process.cwd());
const port = Number(process.env.DOCKYARD_REVIEW_PORT || 5174);
const mcpPath = path.join(projectRoot, "scripts", "dockyard-mcp.mjs");

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function callMcp(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [mcpPath], {
      cwd: projectRoot,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    let errors = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Dockyard MCP 响应超时"));
    }, 15_000);
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { errors += chunk.toString(); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", () => {
      clearTimeout(timer);
      const line = output.trim().split(/\r?\n/)[0];
      if (!line) return reject(new Error(errors.trim() || "Dockyard MCP 没有返回结果"));
      try {
        const response = JSON.parse(line);
        if (response.error) return reject(new Error(response.error.message || "Dockyard MCP 请求失败"));
        resolve(response.result);
      } catch (error) {
        reject(new Error(error instanceof Error ? error.message : "Dockyard MCP 返回格式无效"));
      }
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method === "GET" && req.url === "/review/health") return json(res, 200, { ok: true, service: "dockyard-review-bridge" });
  if (req.method !== "POST" || req.url !== "/review/submit") return json(res, 404, { error: "Review bridge route not found" });

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
    if (body.length > 1_000_000) req.destroy(new Error("Request too large"));
  });
  req.on("end", async () => {
    try {
      const payload = JSON.parse(body || "{}");
      if (typeof payload.reviewId !== "string" || !Array.isArray(payload.itemDecisions)) throw new Error("评审提交缺少 reviewId 或 itemDecisions");
      const result = await callMcp({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "dockyard_record_review_decision",
          arguments: payload,
        },
      });
      return json(res, 200, result);
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : "评审提交失败" });
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Dockyard review bridge listening on 127.0.0.1:${port}\n`);
});

function stop() { server.close(() => process.exit(0)); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

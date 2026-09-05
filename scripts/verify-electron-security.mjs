import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const electronBin = join(
  projectRoot,
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron",
);
const debugPort = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : null;
    server.close((error) => error ? reject(error) : resolve(port));
  });
});
const debugEndpoint = `http://127.0.0.1:${debugPort}/json/list`;
const verificationData = join(
  projectRoot,
  ".tmp",
  "security-verification",
  String(process.pid),
);
mkdirSync(verificationData, { recursive: true });
let electronOutput = "";

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function targets() {
  return (await fetch(debugEndpoint)).json();
}

async function waitForTarget(predicate, timeoutMs = 15_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const target = (await targets()).find(predicate);
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(
    `等待 Dockyard 页面超时：${lastError || "未找到页面"}\n${electronOutput}`,
  );
}

async function evaluate(target, expression) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("桌面页面验证超时"));
    }, 10_000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.error) reject(new Error(message.error.message));
      else if (message.result.exceptionDetails)
        reject(new Error(message.result.exceptionDetails.text));
      else resolve(message.result.result.value);
    });
    socket.send(JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
  });
}

const electron = spawn(
  electronBin,
  [
    projectRoot,
    "--dockyard-prod",
    `--remote-debugging-port=${debugPort}`,
    "--disable-gpu",
    "--disable-gpu-compositing",
  ],
  {
    cwd: verificationData,
    env: {
      ...process.env,
      DOCKYARD_DATA_DIR: verificationData,
      DOCKYARD_USER_DATA_DIR: join(verificationData, "user-data"),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
electron.stdout.on("data", (chunk) => {
  electronOutput = `${electronOutput}${chunk}`.slice(-8_000);
});
electron.stderr.on("data", (chunk) => {
  electronOutput = `${electronOutput}${chunk}`.slice(-8_000);
});
electron.on("error", (error) => {
  electronOutput = `${electronOutput}\n${error.stack || error}`.slice(-8_000);
});

try {
  const bar = await waitForTarget((target) => target.url.includes("view=bar"));
  console.log("已找到应用主帧");
  assert.equal(
    await evaluate(bar, "Boolean(window.dockyard && window.dockyard.loadWorkspace)"),
    true,
    "应用主帧没有取得工作区桥接",
  );
  assert.equal(
    await evaluate(bar, "window.dockyard.loadWorkspace().then(Boolean)"),
    true,
    "受信应用主帧无法调用工作区消息",
  );
  console.log("受信主帧消息验证通过");

  const probe = await evaluate(
    bar,
    `new Promise((resolve) => {
      const frame = document.createElement("iframe");
      frame.id = "dockyard-security-runtime";
      frame.sandbox = "allow-scripts";
      const timeout = setTimeout(() => {
        removeEventListener("message", receive);
        frame.remove();
        resolve({ type: "timeout" });
      }, 8000);
      const receive = (event) => {
        if (event.source !== frame.contentWindow || event.data?.protocol !== "dockyard-overlay") return;
        if (!/^(module-ready|module-error)$/.test(event.data.type)) return;
        clearTimeout(timeout);
        removeEventListener("message", receive);
        const childDocumentReadable = Boolean(frame.contentDocument);
        resolve({
          type: event.data.type,
          childDocumentReadable,
          error: event.data.error || "",
        });
      };
      addEventListener("message", receive);
      frame.src = "dockyard-static://components/runtime.html";
      document.body.append(frame);
    })`,
  );
  assert.deepEqual(
    probe,
    {
      type: "module-ready",
      childDocumentReadable: false,
      error: "",
    },
    `沙箱运行页没有正常运行并隔离文档：${JSON.stringify(probe)}`,
  );
  const runtimeTarget = await waitForTarget(
    (target) => target.url.includes("dockyard-static://components/runtime.html"),
  );
  const untrustedCapabilities = await evaluate(
    runtimeTarget,
    `({
      ownBridge: typeof window.dockyard,
      parentBridge: (() => {
        try { return typeof parent.dockyard; } catch { return "blocked"; }
      })(),
      localModel: typeof window.dockyard?.recognizeSketch,
    })`,
  );
  assert.deepEqual(
    untrustedCapabilities,
    {
      ownBridge: "undefined",
      parentBridge: "blocked",
      localModel: "undefined",
    },
    "非受信运行页仍可读取工作区桥接或调用本地模型",
  );
  await evaluate(
    bar,
    'document.querySelector("#dockyard-security-runtime")?.remove(); true',
  );
  console.log("沙箱页面隔离验证通过");

  assert.equal(
    await evaluate(bar, 'window.open("data:text/html,blocked") === null'),
    true,
    "未允许的弹窗没有被拒绝",
  );
  console.log("弹窗默认拒绝验证通过");
  const originalUrl = bar.url;
  await evaluate(
    bar,
    'location.href = "data:text/html,blocked"; new Promise((resolve) => setTimeout(() => resolve(location.href), 250))',
  );
  const currentBar = await waitForTarget((target) => target.url.includes("view=bar"));
  assert.equal(currentBar.url, originalUrl, "应用主窗口发生了未允许的顶层跳转");
  console.log("顶层导航限制验证通过");
  assert.equal(
    await evaluate(currentBar, "Notification.requestPermission()"),
    "denied",
    "通知权限没有默认拒绝",
  );
  console.log("权限默认拒绝验证通过");

  console.log("Electron 安全边界桌面验收通过。");
} finally {
  if (process.platform === "win32" && electron.pid) {
    spawnSync("taskkill.exe", ["/pid", String(electron.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else electron.kill();
}

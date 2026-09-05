import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const verificationData = join(
  projectRoot,
  ".tmp",
  "bar-position-verification",
  String(process.pid),
);
mkdirSync(verificationData, { recursive: true });

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForTarget(endpoint, output, timeoutMs = 15_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const targets = await fetch(endpoint).then((response) => response.json());
      const target = targets.find((item) => item.url.includes("view=bar"));
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(
    `等待工具条页面超时：${lastError || "未找到页面"}\n${output.value}`,
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
      reject(new Error("工具条页面验证超时"));
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

async function launch() {
  const port = await availablePort();
  const output = { value: "" };
  const electron = spawn(
    electronBin,
    [
      projectRoot,
      "--dockyard-prod",
      `--remote-debugging-port=${port}`,
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
  for (const stream of [electron.stdout, electron.stderr])
    stream.on("data", (chunk) => {
      output.value = `${output.value}${chunk}`.slice(-8_000);
    });
  const target = await waitForTarget(
    `http://127.0.0.1:${port}/json/list`,
    output,
  );
  return { electron, target };
}

function stop(electron) {
  if (process.platform === "win32" && electron.pid) {
    spawnSync("taskkill.exe", ["/pid", String(electron.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else electron.kill();
}

const readPosition = (target) => evaluate(
  target,
  `({
    x: screenX,
    y: screenY,
    width: outerWidth,
    height: outerHeight,
    workArea: {
      x: screen.availLeft,
      y: screen.availTop,
      width: screen.availWidth,
      height: screen.availHeight,
    },
  })`,
);

async function waitForSavedPosition(indexPath, expected, timeoutMs = 5_000) {
  const startedAt = Date.now();
  let index;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      index = JSON.parse(readFileSync(indexPath, "utf8"));
      if (
        index.windowState?.bar?.x === expected.x &&
        index.windowState?.bar?.y === expected.y
      ) return index;
    } catch {
      // The app can still be creating its machine-state file.
    }
    await delay(50);
  }
  throw new Error(
    `工具条位置没有写入机器状态：${JSON.stringify(index?.windowState?.bar)}`,
  );
}

let running;
try {
  running = await launch();
  const initial = await readPosition(running.target);
  assert.deepEqual(
    { x: initial.x, y: initial.y },
    {
      x: initial.workArea.x + initial.workArea.width - 452 - 24,
      y: initial.workArea.y + initial.workArea.height - 64 - 32,
    },
    "首次启动的工具条不在主工作区右下角",
  );

  const moved = {
    x: initial.workArea.x + 80,
    y: initial.workArea.y + 80,
  };
  const actualMoved = await evaluate(
    running.target,
    `(() => new Promise((resolve) => {
      window.moveTo(${moved.x}, ${moved.y});
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if ((screenX === ${moved.x} && screenY === ${moved.y}) || Date.now() - startedAt > 5000) {
          clearInterval(timer);
          resolve({ x: screenX, y: screenY });
        }
      }, 50);
    }))()`,
  );
  assert.deepEqual(actualMoved, moved, "工具条没有移动到验证位置");
  const indexPath = join(verificationData, "index.json");
  const index = await waitForSavedPosition(indexPath, moved);
  stop(running.electron);
  running = null;

  running = await launch();
  const restored = await readPosition(running.target);
  assert.deepEqual(
    { x: restored.x, y: restored.y },
    moved,
    "重新启动没有恢复工具条位置",
  );
  stop(running.electron);
  running = null;

  writeFileSync(indexPath, JSON.stringify({
    ...index,
    windowState: { ...index.windowState, bar: { x: 100_000, y: 100_000 } },
  }, null, 2));
  running = await launch();
  const clamped = await readPosition(running.target);
  assert.ok(
    clamped.x >= clamped.workArea.x &&
      clamped.y >= clamped.workArea.y &&
      clamped.x + 452 <= clamped.workArea.x + clamped.workArea.width &&
      clamped.y + 64 <= clamped.workArea.y + clamped.workArea.height,
    `失效位置没有限制到可见工作区：${JSON.stringify(clamped)}`,
  );

  console.log("工具条默认位置、位置记忆和可见区域限制验收通过。");
} finally {
  if (running) stop(running.electron);
}

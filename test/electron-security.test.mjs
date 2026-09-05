import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(projectRoot, path), "utf8");

test("Electron 启动链不关闭浏览器沙箱", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.doesNotMatch(packageJson.scripts.start, /--no-sandbox/);
  assert.doesNotMatch(read("scripts/dev.mjs"), /--no-sandbox/);
});

test("主应用和静态运行页声明各自的内容安全策略", () => {
  assert.match(read("index.html"), /Content-Security-Policy/i);
  assert.match(
    read("prototypes/static-component-overlay/runtime.html"),
    /Content-Security-Policy/i,
  );
});

test("远程预览和静态运行页使用受限 iframe", () => {
  assert.match(
    read("src/excalidraw/StorybookSidebar.tsx"),
    /<iframe[^>]+sandbox=/s,
  );
  assert.match(
    read("src/overlay/PrototypeOverlay.tsx"),
    /<iframe[^>]+sandbox="allow-scripts"/s,
  );
});

test("预加载桥只在主帧暴露且所有应用 IPC 经过发送者校验", () => {
  assert.match(read("electron/preload.cts"), /process\.isMainFrame/);
  const main = read("electron/main.ts");
  assert.doesNotMatch(main, /ipcMain\.handle\("/);
  assert.doesNotMatch(main, /ipcMain\.on\("/);
  assert.match(main, /setPermissionCheckHandler/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /will-download/);
  assert.match(main, /protocol\.handle\("dockyard-static"/);
});

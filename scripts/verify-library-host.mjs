import assert from "node:assert/strict";

const port = process.env.DOCKYARD_DEBUG_PORT || "9223";
const endpoint = `http://127.0.0.1:${port}/json/list`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targets = async () => (await fetch(endpoint)).json();

async function cdp(target, method, params) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("CDP 执行超时")), 5000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    socket.send(
      JSON.stringify({
        id: 1,
        method,
        params,
      }),
    );
  });
}

async function evaluate(target, expression) {
  const result = await cdp(target, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.result.value;
}

async function waitForTarget(predicate, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const target = (await targets()).find(predicate);
    if (target) return target;
    await delay(100);
  }
  throw new Error("等待 Dockyard 调试页面超时");
}

async function waitForValue(target, expression, predicate, timeoutMs = 5000) {
  const startedAt = Date.now();
  let lastValue;
  while (Date.now() - startedAt < timeoutMs) {
    const value = await evaluate(target, expression);
    lastValue = value;
    if (predicate(value)) return value;
    await delay(100);
  }
  throw new Error(`等待 Dockyard 页面状态超时：${JSON.stringify(lastValue)}`);
}

let pages = await targets();
const bar = pages.find((item) => item.url.includes("view=bar"));
assert.ok(bar, "没有找到 Dockyard 工具条页面");
let annotator = pages.find((item) => item.url.includes("view=annotator"));
if (!annotator) {
  const opened = await evaluate(
    bar,
    `(async () => {
      if (!window.dockyard) return false;
      await window.dockyard.openPanel("annotator");
      return true;
    })()`,
  );
  assert.equal(opened, true, "工具条没有提供打开画板的接口");
  annotator = await waitForTarget((item) => item.url.includes("view=annotator"));
}

assert.equal(
  await waitForValue(
    annotator,
    "window.name",
    (value) => value === "dockyard-annotator",
  ),
  "dockyard-annotator",
  "画板没有设置官方素材库所需的稳定窗口名",
);
const libraryHost = await waitForValue(
  annotator,
  `(() => {
    const host = document.querySelector(".excalidraw-wrap");
    return host ? {
      returnUrl: host.dataset.libraryReturnUrl || "",
      target: host.dataset.libraryTarget || "",
      token: host.dataset.libraryToken || "",
    } : null;
  })()`,
  (value) => Boolean(value?.returnUrl && value?.target && value?.token),
);
assert.equal(libraryHost.target, "dockyard-annotator");
const returnUrl = libraryHost.returnUrl;
assert.equal(new URL(returnUrl).searchParams.get("view"), "annotator");
const libraryUrl = process.env.DOCKYARD_LIBRARY_URL;
const returnHash = new URLSearchParams({
  addLibrary: libraryUrl || "",
  token: libraryHost.token,
}).toString();

const before = await targets();
await evaluate(
  annotator,
  `(() => {
    window.__dockyardLibraryReturnSeen = "";
    window.addEventListener("hashchange", () => {
      window.__dockyardLibraryReturnSeen = window.location.hash;
    }, { once: true });
    return true;
  })()`,
);
await evaluate(
  annotator,
  `window.open(${JSON.stringify(`${returnUrl}#${returnHash}`)}, "dockyard-annotator"); true`,
);
await delay(400);
pages = await targets();
if (!libraryUrl) {
  assert.ok(
    (await evaluate(
      pages.find((item) => item.url.includes("view=annotator")),
      'window.__dockyardLibraryReturnSeen || ""',
    )).includes("#addLibrary="),
    "素材参数没有传回原画板",
  );
}
assert.equal(
  pages.filter((item) => item.url.includes("view=bar")).length,
  before.filter((item) => item.url.includes("view=bar")).length,
  "素材返回后生成了额外的 Dockyard 工具条页面",
);
assert.equal(
  pages.filter((item) => item.url.includes("view=annotator")).length,
  1,
  "素材返回后没有复用原画板页面",
);
if (libraryUrl) {
  const workspaceAfter = await waitForValue(
    pages.find((item) => item.url.includes("view=annotator")),
    "window.dockyard.loadWorkspace()",
    (value) => value.libraryItems.length > 0,
    5000,
  );
  assert.ok(workspaceAfter.libraryItems.length, "素材返回后没有导入工作区");
}

console.log("Dockyard 官方素材库返回流程验证通过。");

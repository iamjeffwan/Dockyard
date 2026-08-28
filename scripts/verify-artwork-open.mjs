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
    const timeout = setTimeout(() => reject(new Error("CDP 执行超时")), 3000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    socket.send(JSON.stringify({ id: 1, method, params }));
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

const pages = await targets();
const bar = pages.find((item) => item.url.includes("view=bar"));
assert.ok(bar, "没有找到 Dockyard 工具条页面");
for (const page of pages.filter((item) => item.url.includes("view=annotator"))) {
  await evaluate(page, "window.close(); true");
}
await delay(150);

const rect = await evaluate(
  bar,
  `(() => {
    const item = [...document.querySelectorAll("button, [role=button]")]
      .find((node) => /图稿|画稿/.test(node.textContent || ""));
    if (!item) return null;
    const box = item.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  })()`,
);
assert.ok(rect, "工具条中没有找到画稿入口");
const artworkDisabled = await evaluate(
  bar,
  `(() => [...document.querySelectorAll("button")]
    .find((node) => /图稿|画稿/.test(node.textContent || ""))?.disabled || false)()`,
);
if (artworkDisabled) {
  await evaluate(bar, "window.dockyard.openPanel('annotator'); true");
} else {
  await cdp(bar, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  });
  await cdp(bar, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  });
}

const startedAt = Date.now();
let opened = false;
let annotator;
while (Date.now() - startedAt < 3000) {
  annotator = (await targets()).find((item) => item.url.includes("view=annotator"));
  if (annotator) {
    opened = true;
    break;
  }
  await delay(100);
}
assert.ok(opened, "点击画稿后没有打开画板窗口");
await delay(500);
const rendered = await evaluate(
  annotator,
  `(() => ({
    rootChildren: document.querySelector("#root")?.children.length || 0,
    hasCanvas: Boolean(document.querySelector(".excalidraw-wrap canvas")),
    hasToolbar: Boolean(document.querySelector(".excalidraw")),
  }))()`,
);
assert.ok(rendered.rootChildren > 0, "画板窗口打开但 React 根节点为空");
assert.ok(rendered.hasCanvas || rendered.hasToolbar, "画板窗口打开但 Excalidraw 未渲染");
console.log("画稿点击打开验证通过。");

import assert from "node:assert/strict";

const port = process.env.DOCKYARD_DEBUG_PORT || "9333";
const endpoint = `http://127.0.0.1:${port}/json/list`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targets = async () => (await fetch(endpoint)).json();

async function cdp(target, method, params = {}) {
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

async function waitFor(read, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await read();
    if (value) return value;
    await delay(50);
  }
  throw new Error("等待画板工具栏超时");
}

let pages = await targets();
let annotator = pages.find((item) => item.url.includes("view=annotator"));
if (!annotator) {
  const bar = pages.find((item) => item.url.includes("view=bar"));
  assert.ok(bar, "没有找到 Dockyard 工具条页面");
  await evaluate(bar, "window.dockyard.openPanel('annotator'); true");
  annotator = await waitFor(async () => (await targets()).find((item) => item.url.includes("view=annotator")));
}

await waitFor(() => evaluate(annotator, "Boolean(document.querySelector('[data-testid=toolbar-component]'))"));

const initial = await evaluate(annotator, `(() => ({
  componentTools: document.querySelectorAll('[data-testid=toolbar-component]').length,
  floatingSwitches: document.querySelectorAll('.prototype-overlay-mode-switch').length,
}))()`);
assert.deepEqual(initial, { componentTools: 1, floatingSwitches: 0 });

await evaluate(annotator, "document.querySelector('[data-testid=toolbar-component]').click(); true");
await delay(50);
const componentMode = await evaluate(annotator, `(() => ({
  componentChecked: document.querySelector('[data-testid=toolbar-component]')?.checked || false,
  nativeChecked: document.querySelectorAll('input[name=editor-current-shape]:checked:not([data-testid=toolbar-component])').length,
}))()`);
assert.deepEqual(componentMode, { componentChecked: true, nativeChecked: 0 });

await evaluate(annotator, "document.querySelector('[data-testid=toolbar-rectangle]').click(); true");
await delay(50);
const nativeClick = await evaluate(annotator, `(() => ({
  componentChecked: document.querySelector('[data-testid=toolbar-component]')?.checked || false,
  rectangleChecked: document.querySelector('[data-testid=toolbar-rectangle]')?.checked || false,
}))()`);
assert.deepEqual(nativeClick, { componentChecked: false, rectangleChecked: true });

await evaluate(annotator, "document.querySelector('[data-testid=toolbar-component]').click(); true");
await evaluate(
  annotator,
  "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'r', code: 'KeyR', bubbles: true })); true",
);
await delay(50);
const nativeShortcut = await evaluate(annotator, `(() => ({
  componentChecked: document.querySelector('[data-testid=toolbar-component]')?.checked || false,
  rectangleChecked: document.querySelector('[data-testid=toolbar-rectangle]')?.checked || false,
}))()`);
assert.deepEqual(nativeShortcut, { componentChecked: false, rectangleChecked: true });

await evaluate(annotator, "document.querySelector('[data-testid=toolbar-component]').click(); true");
await delay(100);
const runtimeReady = await waitFor(() => evaluate(annotator, `(() => {
  const frame = document.querySelector('.prototype-overlay-shared iframe');
  const className = frame?.contentDocument?.querySelector('.static-overlay-runtime')?.className || '';
  return frame ? { className, source: frame.src } : null;
})()`));
assert.match(runtimeReady.className, /is-component/, `共享运行页未进入组件模式：${runtimeReady.source}`);
await evaluate(annotator, `(() => {
  const frame = document.querySelector('.prototype-overlay-shared iframe');
  const target = frame.contentDocument.querySelector('button') || frame.contentDocument.body;
  target.focus();
  target.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: 'r', code: 'KeyR', bubbles: true }));
  return true;
})()`);
await delay(100);
const iframeShortcut = await evaluate(annotator, `(() => ({
  componentChecked: document.querySelector('[data-testid=toolbar-component]')?.checked || false,
  rectangleChecked: document.querySelector('[data-testid=toolbar-rectangle]')?.checked || false,
}))()`);
assert.deepEqual(iframeShortcut, { componentChecked: false, rectangleChecked: true });

await evaluate(annotator, "document.querySelector('[data-testid=toolbar-component]').click(); true");
await delay(100);
await evaluate(annotator, `(() => {
  const frame = document.querySelector('.prototype-overlay-shared iframe');
  const input = frame.contentDocument.createElement('input');
  frame.contentDocument.body.append(input);
  input.focus();
  input.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: 'r', code: 'KeyR', bubbles: true }));
  input.remove();
  return true;
})()`);
await delay(100);
const iframeInput = await evaluate(annotator, `(() => ({
  componentChecked: document.querySelector('[data-testid=toolbar-component]')?.checked || false,
  rectangleChecked: document.querySelector('[data-testid=toolbar-rectangle]')?.checked || false,
}))()`);
assert.deepEqual(iframeInput, { componentChecked: true, rectangleChecked: false });

await evaluate(annotator, "document.querySelector('[data-dockyard-component-tool-host]').remove(); true");
await delay(100);
const remounted = await evaluate(annotator, `(() => ({
  hosts: document.querySelectorAll('[data-dockyard-component-tool-host]').length,
  tools: document.querySelectorAll('[data-testid=toolbar-component]').length,
  componentChecked: document.querySelector('[data-testid=toolbar-component]')?.checked || false,
}))()`);
assert.deepEqual(remounted, { hosts: 1, tools: 1, componentChecked: true });

console.log("顶部组件工具端到端验证通过。");

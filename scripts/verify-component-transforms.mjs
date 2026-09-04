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
    const timeout = setTimeout(() => reject(new Error(`CDP 执行超时：${method}`)), 5000);
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(read, message, timeoutMs = 7000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await read();
    if (value) return value;
    await delay(50);
  }
  throw new Error(message);
}

async function pointerGesture(target, componentId, selector, dx, dy, terminalEvent = "pointerup") {
  await evaluate(target, `(() => {
    const frame = document.querySelector('.prototype-overlay-shared iframe');
    const surface = [...frame.contentDocument.querySelectorAll('[data-component-id]')]
      .find((item) => item.dataset.componentId === ${JSON.stringify(componentId)});
    const target = surface?.querySelector(${JSON.stringify(selector)});
    if (!target) throw new Error('没有找到组件操作点：${selector}');
    target.setPointerCapture = () => {};
    const rect = target.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const pointer = (type, x, y, buttons) => target.dispatchEvent(new frame.contentWindow.PointerEvent(type, {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: x,
      clientY: y,
      button: 0,
      buttons,
    }));
    pointer('pointerdown', startX, startY, 1);
    for (let step = 1; step <= 6; step += 1) {
      pointer('pointermove', startX + (${dx} * step) / 6, startY + (${dy} * step) / 6, 1);
    }
    pointer(${JSON.stringify(terminalEvent)}, startX + ${dx}, startY + ${dy}, 0);
    return true;
  })()`);
  await delay(150);
}

async function geometry(target, componentId) {
  return evaluate(target, `(() => {
    const frame = document.querySelector('.prototype-overlay-shared iframe');
    if (!frame?.contentDocument) return null;
    const surface = [...frame.contentDocument.querySelectorAll('[data-component-id]')]
      .find((item) => item.dataset.componentId === ${JSON.stringify(componentId)});
    return surface ? { width: surface.style.width, height: surface.style.height, transform: surface.style.transform } : null;
  })()`);
}

let pages = await targets();
let annotator = pages.find((item) => item.url.includes("view=annotator"));
if (!annotator) {
  const bar = pages.find((item) => item.url.includes("view=bar"));
  assert.ok(bar, "没有找到 Dockyard 工具条页面");
  await evaluate(bar, "window.dockyard.openPanel('annotator'); true");
  annotator = await waitFor(
    async () => (await targets()).find((item) => item.url.includes("view=annotator")),
    "等待图稿页面超时",
  );
}

await waitFor(
  () => evaluate(annotator, "Boolean(document.querySelector('[data-testid=toolbar-component]'))"),
  "等待组件工具超时",
);
await evaluate(annotator, "document.querySelector('[data-testid=toolbar-component]').click(); true");

const instanceIds = await waitFor(
  () => evaluate(annotator, `(() => {
    const frame = document.querySelector('.prototype-overlay-shared iframe');
    const ids = [...(frame?.contentDocument?.querySelectorAll('[data-component-id]') || [])]
      .map((item) => item.dataset.componentId);
    return ids.length >= 2 ? ids : null;
  })()`),
  "真实图稿中至少需要两个静态组件",
);
const [firstId, secondId] = instanceIds;

await evaluate(annotator, `(() => {
  const frame = document.querySelector('.prototype-overlay-shared iframe');
  if (window.__componentTransformListener) {
    window.removeEventListener('message', window.__componentTransformListener);
  }
  const evidence = {
    frameWindow: frame.contentWindow,
    frameLoads: 0,
    drops: 0,
    transforms: 0,
  };
  window.__componentTransformEvidence = evidence;
  frame.addEventListener('load', () => { evidence.frameLoads += 1; });
  window.__componentTransformListener = (event) => {
    if (event.source !== frame.contentWindow || event.data?.protocol !== 'dockyard-overlay') return;
    if (event.data.type === 'component-drop') evidence.drops += 1;
    if (event.data.type === 'component-transform') evidence.transforms += 1;
  };
  window.addEventListener('message', window.__componentTransformListener);
  return true;
})()`);

const buttonComponentId = await evaluate(annotator, `(() => {
  const frame = document.querySelector('.prototype-overlay-shared iframe');
  const button = frame.contentDocument.querySelector('[data-component-id] .cds--btn');
  if (!button) return null;
  button.click();
  return button.closest('[data-component-id]').dataset.componentId;
})()`);
assert.ok(buttonComponentId, "真实图稿中需要 Carbon Button 以验证交互状态");
await delay(50);
const buttonText = await evaluate(annotator, `document.querySelector('.prototype-overlay-shared iframe').contentDocument.querySelector('[data-component-id] .cds--btn').textContent`);

const firstBefore = await geometry(annotator, firstId);
await pointerGesture(annotator, firstId, ".component-sequence", 25, 18, "pointercancel");
assert.deepEqual(await geometry(annotator, firstId), firstBefore, "取消拖动应恢复起始位置");
assert.equal(await evaluate(annotator, "window.__componentTransformEvidence.drops"), 0);

await pointerGesture(annotator, firstId, ".component-sequence", 42, 28);
const firstAfterMove = await geometry(annotator, firstId);
assert.notEqual(firstAfterMove.transform, firstBefore.transform, "拖动编号后组件位置应变化");

let evidence = await evaluate(annotator, "({ drops: window.__componentTransformEvidence.drops, transforms: window.__componentTransformEvidence.transforms, frameLoads: window.__componentTransformEvidence.frameLoads, sameFrame: window.__componentTransformEvidence.frameWindow === document.querySelector('.prototype-overlay-shared iframe').contentWindow })");
assert.deepEqual(evidence, { drops: 1, transforms: 0, frameLoads: 0, sameFrame: true });

await pointerGesture(annotator, secondId, ".component-sequence", -32, 24);
evidence = await evaluate(annotator, "({ drops: window.__componentTransformEvidence.drops, transforms: window.__componentTransformEvidence.transforms, frameLoads: window.__componentTransformEvidence.frameLoads, sameFrame: window.__componentTransformEvidence.frameWindow === document.querySelector('.prototype-overlay-shared iframe').contentWindow })");
assert.deepEqual(evidence, { drops: 2, transforms: 0, frameLoads: 0, sameFrame: true });

await pointerGesture(annotator, firstId, ".component-natural-content", 30, 20);
assert.deepEqual(await geometry(annotator, firstId), firstAfterMove, "组件内容区域拖动不应移动组件");
assert.equal(await evaluate(annotator, "window.__componentTransformEvidence.drops"), 2);

const beforeResize = await geometry(annotator, firstId);
await pointerGesture(annotator, firstId, ".component-resize-handle", 36, 22);
const afterResize = await geometry(annotator, firstId);
assert.notEqual(afterResize.width, beforeResize.width, "缩放后宽度应变化");
assert.notEqual(afterResize.height, beforeResize.height, "缩放后高度应变化");
assert.equal(await evaluate(annotator, "window.__componentTransformEvidence.drops"), 3);

const beforeRotate = await geometry(annotator, firstId);
await pointerGesture(annotator, firstId, ".component-rotate-handle", 48, 28);
const afterRotate = await geometry(annotator, firstId);
assert.notEqual(afterRotate.transform, beforeRotate.transform, "旋转后角度应变化");

const finalEvidence = await evaluate(annotator, `(() => {
  const frame = document.querySelector('.prototype-overlay-shared iframe');
  const button = frame.contentDocument.querySelector('[data-component-id] .cds--btn');
  return {
    drops: window.__componentTransformEvidence.drops,
    transforms: window.__componentTransformEvidence.transforms,
    frameLoads: window.__componentTransformEvidence.frameLoads,
    sameFrame: window.__componentTransformEvidence.frameWindow === frame.contentWindow,
    buttonText: button?.textContent || '',
  };
})()`);
assert.deepEqual(finalEvidence, {
  drops: 4,
  transforms: 0,
  frameLoads: 0,
  sameFrame: true,
  buttonText,
});

const persistedGeometry = await geometry(annotator, firstId);
await evaluate(annotator, "setTimeout(() => window.close(), 0); true");
await waitFor(
  async () => !(await targets()).some((item) => item.url.includes("view=annotator")),
  "关闭图稿页面超时",
);
const bar = await waitFor(
  async () => (await targets()).find((item) => item.url.includes("view=bar")),
  "没有找到 Dockyard 工具条页面",
);
await evaluate(bar, "window.dockyard.openPanel('annotator'); true");
annotator = await waitFor(
  async () => (await targets()).find((item) => item.url.includes("view=annotator")),
  "重新打开图稿页面超时",
);
await waitFor(
  () => geometry(annotator, firstId),
  "重新打开图稿后组件未恢复",
);
assert.deepEqual(await geometry(annotator, firstId), persistedGeometry);

console.log("组件移动、缩放、旋转与持久化端到端验证通过。");

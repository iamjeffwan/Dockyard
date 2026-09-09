import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(join(fileURLToPath(import.meta.url), "..", ".."));
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const evidenceDir = process.env.DOCKYARD_PROTOTYPE_EVIDENCE_DIR || join(root, ".tmp", "design-relations-acceptance");
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error || !port ? reject(error || new Error("没有可用端口")) : resolvePort(port));
    });
  });
}

async function waitFor(read, message, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { const value = await read(); if (value) return value; } catch { /* 页面仍在加载 */ }
    await delay(100);
  }
  throw new Error(message);
}

async function cdp(target, method, params = {}) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return new Promise((resolveResult, reject) => {
    const timeout = setTimeout(() => { socket.close(); reject(new Error(`调试命令超时：${method}`)); }, 10000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout); socket.close();
      if (message.error) reject(new Error(message.error.message)); else resolveResult(message.result);
    });
    socket.send(JSON.stringify({ id: 1, method, params }));
  });
}

async function evaluate(target, expression) {
  const result = await cdp(target, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "页面脚本失败");
  return result.result.value;
}

async function screenshot(target, name) {
  mkdirSync(evidenceDir, { recursive: true });
  const result = await cdp(target, "Page.captureScreenshot", { format: "png" });
  writeFileSync(join(evidenceDir, `${name}.png`), Buffer.from(result.data, "base64"));
}

async function clickPoint(target, point) {
  await cdp(target, "Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await cdp(target, "Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
  await cdp(target, "Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
}

async function dragPoint(target, start, end, steps = 24, button = "middle") {
  const buttons = button === "middle" ? 4 : 1;
  await cdp(target, "Input.dispatchMouseEvent", { type: "mouseMoved", ...start });
  await cdp(target, "Input.dispatchMouseEvent", { type: "mousePressed", ...start, button, buttons, clickCount: 1 });
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    await cdp(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
      button,
      buttons,
    });
    await delay(8);
  }
  await cdp(target, "Input.dispatchMouseEvent", { type: "mouseReleased", ...end, button, buttons: 0, clickCount: 1 });
}

function scenePoint(target, id) {
  return evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    const element = scene.find((item) => item.id === ${JSON.stringify(id)});
    const state = window.__dockyardRelationPrototype.getAppState();
    if (!element) return null;
    return { x: (element.x + element.width / 2 + state.scrollX) * state.zoom.value, y: (element.y + element.height / 2 + state.scrollY) * state.zoom.value };
  })()`);
}

async function stableScenePoint(target, id) {
  let previous;
  let stableReads = 0;
  return waitFor(async () => {
    const point = await scenePoint(target, id);
    if (previous && Math.abs(point.x - previous.x) < 0.5 && Math.abs(point.y - previous.y) < 0.5) stableReads += 1;
    else stableReads = 0;
    previous = point;
    return stableReads >= 2 ? point : null;
  }, `等待${id}位置稳定超时`);
}

async function openComponentLibrary(target) {
  if (!await evaluate(target, `Boolean(document.querySelector('.storybook-panel-body'))`)) {
    await evaluate(target, `document.querySelector('input[aria-label="打开组件 Stories"]')?.click(); true`);
    await waitFor(() => evaluate(target, `Boolean(document.querySelector('.storybook-panel-body'))`), "组件侧栏没有打开");
  }
  if (!await evaluate(target, `document.querySelectorAll('.storybook-story .cds--btn--icon-only').length === 5`)) {
    await evaluate(target, `document.querySelector('[aria-label^="Carbon React"]')?.click(); true`);
  }
  await waitFor(() => evaluate(target, `document.querySelectorAll('.storybook-story .cds--btn--icon-only').length === 5`), "组件故事列表没有展开");
}

async function addAndConfirmComponent(target, name) {
  await openComponentLibrary(target);
  const previousCount = await evaluate(target, `window.__dockyardRelationPrototype.exportData.componentBindings.length`);
  const added = await evaluate(target, `(() => {
    const story = [...document.querySelectorAll('.storybook-story')].find((item) => item.querySelector('.storybook-story-main')?.textContent?.trim() === ${JSON.stringify(name)});
    story?.querySelector('.cds--btn--icon-only')?.click();
    return Boolean(story);
  })()`);
  assert.ok(added, `组件库中不存在 ${name}`);
  await waitFor(() => evaluate(target, `window.__dockyardRelationPrototype.exportData.componentBindings.length === ${previousCount + 1}`), `${name} 没有直接写入组件关系`);
}

let vite;
let browser;
let target;
let failure;
try {
  assert.ok(existsSync(chrome), `找不到 Chrome：${chrome}`);
  const vitePort = await availablePort();
  vite = spawn(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), "--config", "prototypes/design-relations/vite.config.mjs", "--host", "127.0.0.1", "--port", String(vitePort)], { cwd: root, stdio: "ignore", windowsHide: true });
  const url = `http://127.0.0.1:${vitePort}/prototypes/design-relations/excalidraw.html`;
  await waitFor(async () => { try { return (await fetch(url)).ok; } catch { return false; } }, "等待原型服务超时");
  const debugPort = await availablePort();
  const profile = join(tmpdir(), `dockyard-design-relations-${process.pid}`);
  browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, url], { stdio: "ignore", windowsHide: true });
  const targetsUrl = `http://127.0.0.1:${debugPort}/json/list`;
  target = await waitFor(async () => (await (await fetch(targetsUrl)).json()).find((item) => item.type === "page"), "等待原型页面超时");
  await waitFor(() => evaluate(target, "Boolean(window.__dockyardRelationPrototype?.getSceneElements)"), "原型页面没有完成初始化");

  await evaluate(target, `document.querySelector('input[aria-label="添加交互关系"]')?.click(); true`);
  const sourcePoint = await scenePoint(target, "node-nav-system");
  const targetPoint = await scenePoint(target, "node-system-screen");
  // 关系提示浮层位于画板右上方，目标框的下缘避开浮层后仍有可点击区域。
  targetPoint.y = Math.max(targetPoint.y, 160);
  process.stdout.write(`点击坐标 source=${JSON.stringify(sourcePoint)} target=${JSON.stringify(targetPoint)}\n`);
  await clickPoint(target, sourcePoint);
  await clickPoint(target, targetPoint);
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('[aria-label="设置交互方式"]'))`), "绑定箭头后没有显示交互按钮");
  await evaluate(target, `document.querySelector('[aria-label="设置交互方式"]')?.click(); true`);
  await evaluate(target, "[...document.querySelectorAll('.interaction-options button')].find((button) => button.textContent.includes('点击 · 跳转'))?.click(); true");
  assert.equal((await evaluate(target, "window.__dockyardRelationPrototype.exportData.interactions.length")), 1, "交互关系没有确认");
  await screenshot(target, "interaction-confirmed");

  await waitFor(() => evaluate(target, `Boolean(document.querySelector('[aria-label="修改I1交互方式"]'))`), "已确认交互没有显示修改入口");
  await evaluate(target, `document.querySelector('[aria-label="修改I1交互方式"]')?.click(); true`);
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('.interaction-options'))`), "点击交互文字后没有打开修改菜单");
  await evaluate(target, "[...document.querySelectorAll('.interaction-options button')].find((button) => button.textContent.includes('点击 · 切换'))?.click(); true");
  assert.equal((await evaluate(target, "window.__dockyardRelationPrototype.exportData.interactions[0].label")), "点击 · 切换", "已确认交互不能修改");
  const lockedRelations = await evaluate(target, `window.__dockyardRelationPrototype.getSceneElements().filter((item) => item.type === 'arrow' && item.customData?.relationType).map((item) => ({ id: item.id, locked: item.locked }))`);
  assert.ok(lockedRelations.length > 0 && lockedRelations.every((item) => item.locked === true), "关系箭头没有被锁定");

  await evaluate(target, `document.querySelector('input[aria-label="打开组件 Stories"]')?.click(); true`);
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('.storybook-panel-body'))`), "组件侧栏没有打开");
  await evaluate(target, `document.querySelector('[aria-label^="Carbon React"]')?.click(); true`);
  await waitFor(() => evaluate(target, `document.querySelectorAll('.storybook-story .cds--btn--icon-only').length === 5`), "组件故事列表没有展开");
  const viewportBeforeComponentAdd = await evaluate(target, `(() => {
    const state = window.__dockyardRelationPrototype.getAppState();
    return { zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY };
  })()`);
  await evaluate(target, `document.querySelector('.storybook-story .cds--btn--icon-only')?.click(); true`);
  await waitFor(() => evaluate(target, `Boolean(window.__dockyardRelationPrototype.getSceneElements().find((item) => item.id === 'component-card-C1'))`), "组件卡片没有生成");
  const viewportAfterComponentAdd = await evaluate(target, `(() => {
    const state = window.__dockyardRelationPrototype.getAppState();
    return { zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY };
  })()`);
  process.stdout.write(`新增组件后的画板视口：${JSON.stringify({ before: viewportBeforeComponentAdd, after: viewportAfterComponentAdd })}\n`);
  assert.ok(Math.abs(viewportAfterComponentAdd.zoom - viewportBeforeComponentAdd.zoom) <= 0.001, "新增组件后画板缩放发生变化");
  const layout = await evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    const card = scene.find((item) => item.id === 'component-card-C1');
    const preview = scene.find((item) => item.id === 'component-preview-C1');
    const header = scene.find((item) => item.id === 'C1-library');
    const connector = scene.find((item) => item.id === 'component-link-C1');
    const generatedTarget = scene.find((item) => item.id === 'generated-slot-1');
    const state = window.__dockyardRelationPrototype.getAppState();
    const confirmation = document.querySelector('.confirm-component-binding')?.getBoundingClientRect();
    return {
      card,
      preview,
      header,
      connector,
      generatedTarget,
      cardScreen: card && {
        left: (card.x + state.scrollX) * state.zoom.value,
        right: (card.x + card.width + state.scrollX) * state.zoom.value,
        top: (card.y + state.scrollY) * state.zoom.value,
        bottom: (card.y + card.height + state.scrollY) * state.zoom.value,
      },
      confirmation: confirmation && { left: confirmation.left, right: confirmation.right, top: confirmation.top, bottom: confirmation.bottom },
      viewport: { width: state.width, height: state.height },
    };
  })()`);
  process.stdout.write(`组件关联绑定：${JSON.stringify({
    connector: {
      startBinding: layout.connector?.startBinding,
      endBinding: layout.connector?.endBinding,
      isDeleted: layout.connector?.isDeleted,
    },
    cardBoundElements: layout.card?.boundElements,
  })}\n`);
  assert.ok(layout.card && layout.preview && layout.header && layout.connector, "卡片或关联线元素不完整");
  assert.equal(layout.header.text, "Carbon · Button · primary", "卡片顶部没有显示来源、组件种类和变体");
  assert.ok(layout.header.x + layout.header.width <= layout.card.x + layout.card.width, "卡片顶部组件信息超出右边界");
  assert.equal(layout.card.height, 184, "移除重复状态与底部名称后卡片高度没有缩小");
  assert.equal(layout.generatedTarget?.type, "text", "自动生成的组件关联目标仍包含大尺寸槽位框");
  assert.equal(layout.connector.startBinding?.elementId, "generated-slot-1", "组件关联线没有绑定到自动生成的文本元素");
  assert.ok(layout.preview.x >= layout.card.x && layout.preview.x + layout.preview.width <= layout.card.x + layout.card.width, "预览区域超出卡片");
  assert.equal(layout.connector.strokeStyle, "dashed", "组件关联线不是虚线");
  assert.equal(layout.connector.endArrowhead, "arrow", "组件关联线没有终点箭头");
  assert.ok(layout.cardScreen.left >= 35 && layout.cardScreen.right <= layout.viewport.width - 35 && layout.cardScreen.top >= 35 && layout.cardScreen.bottom <= layout.viewport.height - 35, "新增组件卡片没有平移到当前视口内");
  assert.equal(layout.confirmation, undefined, "组件新增后仍显示多余的确认按钮");
  await screenshot(target, "component-card-layout");

  const cardBeforeResize = await evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    const card = scene.find((item) => item.id === 'component-card-C1');
    const preview = scene.find((item) => item.id === 'component-preview-C1');
    const state = window.__dockyardRelationPrototype.getAppState();
    return { card: { x: card.x, y: card.y, width: card.width, height: card.height }, preview: { x: preview.x, y: preview.y, width: preview.width, height: preview.height }, state: { scrollX: state.scrollX, scrollY: state.scrollY, zoom: state.zoom.value } };
  })()`);
  await evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    window.__dockyardRelationPrototype.replaceSceneElements(scene.map((item) => item.id === 'component-card-C1' ? { ...item, width: item.width * 0.72, height: item.height * 0.72, version: item.version + 1 } : item));
    return true;
  })()`);
  await waitFor(() => evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    const card = scene.find((item) => item.id === 'component-card-C1');
    const preview = scene.find((item) => item.id === 'component-preview-C1');
    return card && preview && preview.x >= card.x && preview.y >= card.y && preview.x + preview.width <= card.x + card.width && preview.y + preview.height <= card.y + card.height;
  })()`), "缩放后的卡片内部布局没有跟随外框更新");
  // 回放用户报告的撤销中间状态：外框恢复，但内部元素仍是缩放后的旧几何数据。
  await evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    window.__dockyardRelationPrototype.replaceSceneElements(scene.map((item) => item.id === 'component-card-C1' ? { ...item, x: ${cardBeforeResize.card.x}, y: ${cardBeforeResize.card.y}, width: ${cardBeforeResize.card.width}, height: ${cardBeforeResize.card.height}, version: item.version + 1 } : item));
    return true;
  })()`);
  const afterResizeUndo = await waitFor(() => evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    const card = scene.find((item) => item.id === 'component-card-C1');
    const preview = scene.find((item) => item.id === 'component-preview-C1');
    const runtime = document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('[data-component-id="reference-runtime-C1"].component-reference-viewport');
    if (!card || !preview || !runtime) return null;
    const runtimeRect = runtime.getBoundingClientRect();
    return { card, preview, runtime: { width: runtimeRect.width, height: runtimeRect.height }, restored: Math.abs(card.width - ${cardBeforeResize.card.width}) < 1 && Math.abs(card.height - ${cardBeforeResize.card.height}) < 1 };
  })()`), "撤销后卡片、预览区域或运行时预览没有同时恢复");
  process.stdout.write(`卡片缩放撤销：${JSON.stringify({ card: { width: afterResizeUndo.card.width, height: afterResizeUndo.card.height }, preview: { x: afterResizeUndo.preview.x, y: afterResizeUndo.preview.y, width: afterResizeUndo.preview.width, height: afterResizeUndo.preview.height }, runtime: afterResizeUndo.runtime, restored: afterResizeUndo.restored })}\n`);
  assert.equal(afterResizeUndo.restored, true, "撤销后卡片外框没有恢复原尺寸");
  assert.ok(afterResizeUndo.preview.x >= afterResizeUndo.card.x && afterResizeUndo.preview.y >= afterResizeUndo.card.y && afterResizeUndo.preview.x + afterResizeUndo.preview.width <= afterResizeUndo.card.x + afterResizeUndo.card.width && afterResizeUndo.preview.y + afterResizeUndo.preview.height <= afterResizeUndo.card.y + afterResizeUndo.card.height, "撤销后预览矩形脱离组件卡片边界");
  assert.ok(afterResizeUndo.runtime.width > 0 && afterResizeUndo.runtime.height > 0, "撤销后运行时预览没有恢复显示");
  await screenshot(target, "component-card-resize-undo");
  const movedGeneratedTarget = await evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    const target = scene.find((item) => item.id === 'generated-slot-1');
    if (!target) return null;
    const next = { x: target.x + 140, y: target.y + 72 };
    window.__dockyardRelationPrototype.selectElement(target.id);
    window.__dockyardRelationPrototype.replaceSceneElements(scene.map((item) => item.id === target.id ? { ...item, ...next, version: item.version + 1 } : item));
    window.__dockyardRelationPrototype.clearSelection();
    return next;
  })()`);
  assert.ok(movedGeneratedTarget, "无法移动自动生成的文本目标以验证位置保存");
  process.stdout.write(`移动组件关联文本：${JSON.stringify(movedGeneratedTarget)}\n`);
  await evaluate(target, `(() => {
    const samples = [];
    const startedAt = performance.now();
    let previousScroll = null;
    const sample = () => {
      const scene = window.__dockyardRelationPrototype.getSceneElements();
      const state = window.__dockyardRelationPrototype.getAppState();
      const preview = scene.find((item) => item.id === 'component-preview-C1');
      const runtimePreview = document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('.component-reference-viewport');
      const rect = runtimePreview?.getBoundingClientRect();
      if (preview && rect) {
        const expectedX = (preview.x + state.scrollX) * state.zoom.value;
        const expectedY = (preview.y + state.scrollY) * state.zoom.value;
        const moving = previousScroll && (previousScroll.x !== state.scrollX || previousScroll.y !== state.scrollY);
        samples.push({ moving: Boolean(moving), dx: rect.x - expectedX, dy: rect.y - expectedY });
        previousScroll = { x: state.scrollX, y: state.scrollY };
      }
      if (performance.now() - startedAt < 1800) requestAnimationFrame(sample);
    };
    window.__dockyardPreviewMotionSamples = samples;
    requestAnimationFrame(sample);
    return true;
  })()`);
  await evaluate(target, `window.__dockyardRelationPrototype.panViewport(140, -30, 12)`);
  await delay(300);
  const motion = await evaluate(target, `(() => {
    const moving = (window.__dockyardPreviewMotionSamples || []).filter((sample) => sample.moving);
    return {
      count: moving.length,
      max: moving.reduce((value, sample) => Math.max(value, Math.hypot(sample.dx, sample.dy)), 0),
      delayedFrames: moving.filter((sample) => Math.hypot(sample.dx, sample.dy) > 8).length,
      last: moving.at(-1) || null,
      worst: moving.toSorted((left, right) => Math.hypot(right.dx, right.dy) - Math.hypot(left.dx, left.dy)).slice(0, 5),
    };
  })()`);
  process.stdout.write(`预览随动测量：${JSON.stringify(motion)}\n`);
  assert.ok(motion.count > 2, "没有采集到画板拖动过程");
  assert.ok(motion.delayedFrames <= 1, `预览内容连续多帧落后于画板：${motion.delayedFrames} 帧`);
  assert.ok(Math.hypot(motion.last?.dx || 0, motion.last?.dy || 0) <= 1, "拖动结束前预览内容仍未与卡片对齐");
  await evaluate(target, `document.querySelector('input[aria-label="选择"]')?.click(); true`);
  const cardDragStart = await evaluate(target, `(() => {
    const card = window.__dockyardRelationPrototype.getSceneElements().find((item) => item.id === 'component-card-C1');
    const state = window.__dockyardRelationPrototype.getAppState();
    return { x: (card.x + 18 + state.scrollX) * state.zoom.value, y: (card.y + 18 + state.scrollY) * state.zoom.value };
  })()`);
  await dragPoint(target, cardDragStart, { x: cardDragStart.x - 80, y: cardDragStart.y + 55 }, 18, "left");
  await delay(200);
  const connectorAfterCardMove = await evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    const connector = scene.find((item) => item.id === 'component-link-C1');
    const card = scene.find((item) => item.id === 'component-card-C1');
    return connector && { isDeleted: connector.isDeleted, x: connector.x, y: connector.y, endBinding: connector.endBinding, points: connector.points, order: { connector: scene.indexOf(connector), card: scene.indexOf(card), target: scene.findIndex((item) => item.id === 'generated-slot-1') }, card: card && { x: card.x, y: card.y, width: card.width, height: card.height } };
  })()`);
  process.stdout.write(`移动卡片后的关联线：${JSON.stringify(connectorAfterCardMove)}\n`);
  assert.ok(connectorAfterCardMove && !connectorAfterCardMove.isDeleted, "移动组件卡片后虚线箭头消失");
  assert.equal(connectorAfterCardMove.endBinding?.elementId, "component-card-C1", "移动组件卡片后箭头终点解除绑定");
  assert.ok(!await evaluate(target, `Boolean(document.querySelector('.preview-interaction-ring'))`), "移动整张卡片时误入预览交互状态");
  await screenshot(target, "component-card-moved");

  const overlapDrag = await evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    const state = window.__dockyardRelationPrototype.getAppState();
    const card = scene.find((item) => item.id === 'component-card-C1');
    const preview = scene.find((item) => item.id === 'component-preview-C1');
    const target = scene.find((item) => item.id === 'generated-slot-1');
    const zoom = state.zoom.value;
    const start = { x: (card.x + 18 + state.scrollX) * zoom, y: (card.y + 18 + state.scrollY) * zoom };
    const delta = {
      x: ((target.x + target.width / 2) - (preview.x + preview.width / 2)) * zoom,
      y: ((target.y + target.height / 2) - (preview.y + preview.height / 2)) * zoom,
    };
    return { start, end: { x: start.x + delta.x, y: start.y + delta.y } };
  })()`);
  await dragPoint(target, overlapDrag.start, overlapDrag.end, 22, "left");
  await delay(120);
  const separatedAfterOverlap = await waitFor(() => evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    const card = scene.find((item) => item.id === 'component-card-C1');
    const target = scene.find((item) => item.id === 'generated-slot-1');
    const connector = scene.find((item) => item.id === 'component-link-C1');
    if (!card || !target || !connector) return null;
    const overlaps = card.x < target.x + target.width && card.x + card.width > target.x && card.y < target.y + target.height && card.y + card.height > target.y;
    const length = Math.hypot(connector.points.at(-1)?.[0] || 0, connector.points.at(-1)?.[1] || 0);
    return { overlaps, length, endBinding: connector.endBinding, card: { x: card.x, y: card.y }, target: { x: target.x, y: target.y } };
  })()`), "卡片与关联区域重叠后没有完成位置校正");
  process.stdout.write(`重叠保护：${JSON.stringify(separatedAfterOverlap)}\n`);
  assert.equal(separatedAfterOverlap.overlaps, false, "组件卡片仍覆盖关联区域，虚线箭头会失去可见线段");
  assert.ok(separatedAfterOverlap.length > 20, "重叠校正后虚线箭头仍没有可见长度");
  assert.equal(separatedAfterOverlap.endBinding?.elementId, "component-card-C1", "重叠校正后箭头绑定丢失");
  await screenshot(target, "component-card-overlap-corrected");
  const previewPoint = await stableScenePoint(target, "component-preview-C1");
  await clickPoint(target, previewPoint);
  assert.equal(await evaluate(target, `Boolean(document.querySelector('.preview-interaction-ring'))`), false, "点击预览矩形仍会直接进入交互状态");
  await evaluate(target, `document.querySelector('.preview-toggle')?.click(); true`);
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('.preview-interaction-ring'))`), "预览开关没有进入交互状态");
  assert.ok(await evaluate(target, `Boolean(document.querySelector('.prototype-overlay-shared.is-active'))`), "预览交互状态没有激活运行层");
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('.static-overlay-runtime.is-component'))`), "运行页没有切换到组件交互模式");
  await evaluate(target, `document.querySelector('.relation-status > button:last-child')?.click(); true`);
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('.relation-summary'))`), "预览交互状态下图稿关系清单没有打开");
  assert.ok(await evaluate(target, `Boolean(document.querySelector('.preview-interaction-ring'))`), "打开图稿关系清单时误退出预览交互状态");
  await evaluate(target, `document.querySelector('[aria-label="关闭关系清单"]')?.click(); true`);
  await clickPoint(target, previewPoint);
  await waitFor(() => evaluate(target, `document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('.cds--btn')?.textContent?.includes('(1)')`), "预览交互状态下真实组件不能响应点击");

  const blankCanvasPoint = await evaluate(target, `(() => {
    const canvas = document.querySelector('.excalidraw__canvas');
    const rect = canvas?.getBoundingClientRect();
    if (!canvas || !rect) return null;
    for (let y = rect.bottom - 24; y >= rect.top + 80; y -= 28) {
      for (let x = rect.left + 24; x <= rect.right - 24; x += 28) {
        const hit = document.elementFromPoint(x, y);
        if (hit?.closest('.excalidraw__canvas') && !hit.closest('.prototype-overlay-layer')) return { x, y };
      }
    }
    return null;
  })()`);
  assert.ok(blankCanvasPoint, "找不到可点击的画板空白处");
  await clickPoint(target, blankCanvasPoint);
  await waitFor(() => evaluate(target, `!document.querySelector('.preview-interaction-ring')`), "点击画板空白处没有退出预览交互状态");
  const reentryPoint = await stableScenePoint(target, "component-preview-C1");
  await cdp(target, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "P", code: "KeyP", modifiers: 8, windowsVirtualKeyCode: 80, nativeVirtualKeyCode: 80 });
  await cdp(target, "Input.dispatchKeyEvent", { type: "keyUp", key: "P", code: "KeyP", modifiers: 8, windowsVirtualKeyCode: 80, nativeVirtualKeyCode: 80 });
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('.preview-interaction-ring'))`), "快捷键 Shift+P 不能再次进入预览交互状态");
  assert.equal(await evaluate(target, `window.__dockyardRelationPrototype.getAppState().activeTool.type`), "selection", "预览快捷键改变了画板当前工具");
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('.static-overlay-runtime.is-component'))`), "再次进入后运行页没有切换到组件交互模式");
  await clickPoint(target, reentryPoint);
  await waitFor(() => evaluate(target, `document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('.cds--btn')?.textContent?.includes('(2)')`), "再次进入后真实组件不能响应点击");
  await cdp(target, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp(target, "Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await waitFor(() => evaluate(target, `!document.querySelector('.preview-interaction-ring')`), "Esc 没有退出预览交互状态");
  await screenshot(target, "preview-interaction-exited");

  const resizedCardBeforeAdding = await evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    const card = scene.find((item) => item.id === 'component-card-C1');
    if (!card) return null;
    const width = Math.round(card.width * 0.76);
    const height = Math.round(card.height * 0.76);
    window.__dockyardRelationPrototype.replaceSceneElements(scene.map((item) => item.id === card.id ? { ...item, width, height, version: item.version + 1 } : item));
    return { width, height };
  })()`);
  assert.ok(resizedCardBeforeAdding, "无法缩放 C1 卡片以验证尺寸保存");
  await waitFor(() => evaluate(target, `(() => {
    const card = window.__dockyardRelationPrototype.getSceneElements().find((item) => item.id === 'component-card-C1');
    return card && Math.abs(card.width - ${resizedCardBeforeAdding.width}) < 1 && Math.abs(card.height - ${resizedCardBeforeAdding.height}) < 1;
  })()`), "C1 缩放状态没有稳定");
  await evaluate(target, `document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); true`);
  await delay(120);

  await evaluate(target, `document.querySelector('input[aria-label="打开组件 Stories"]')?.click(); true`);
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('.storybook-panel-body'))`), "日期组件验收时侧栏没有打开");
  if (!await evaluate(target, `document.querySelectorAll('.storybook-story .cds--btn--icon-only').length === 5`)) {
    await evaluate(target, `document.querySelector('[aria-label^="Carbon React"]')?.click(); true`);
  }
  await waitFor(() => evaluate(target, `document.querySelectorAll('.storybook-story .cds--btn--icon-only').length === 5`), "日期组件列表没有展开");
  await evaluate(target, `document.querySelectorAll('.storybook-story .cds--btn--icon-only')[2]?.click(); true`);
  await waitFor(() => evaluate(target, `window.__dockyardRelationPrototype.exportData.componentBindings.length === 2`), "日期组件没有直接写入组件关系");
  const resizedCardAfterAdding = await evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    const card = scene.find((item) => item.id === 'component-card-C1');
    const preview = scene.find((item) => item.id === 'component-preview-C1');
    const generatedTarget = scene.find((item) => item.id === 'generated-slot-1');
    if (!card || !preview) return null;
    return {
      width: card.width,
      height: card.height,
      previewInside: preview.x >= card.x && preview.y >= card.y && preview.x + preview.width <= card.x + card.width && preview.y + preview.height <= card.y + card.height,
      generatedTarget: generatedTarget && { x: generatedTarget.x, y: generatedTarget.y },
    };
  })()`);
  process.stdout.write(`新增组件后保留已有卡片尺寸：${JSON.stringify({ before: resizedCardBeforeAdding, after: resizedCardAfterAdding })}\n`);
  assert.ok(resizedCardAfterAdding, "新增日期组件后 C1 卡片不存在");
  assert.ok(Math.abs(resizedCardAfterAdding.width - resizedCardBeforeAdding.width) < 1 && Math.abs(resizedCardAfterAdding.height - resizedCardBeforeAdding.height) < 1, "新增组件后已有卡片恢复为初始尺寸");
  assert.equal(resizedCardAfterAdding.previewInside, true, "新增组件后已有卡片的预览区域超出卡片边界");
  assert.ok(Math.abs(resizedCardAfterAdding.generatedTarget.x - movedGeneratedTarget.x) < 1 && Math.abs(resizedCardAfterAdding.generatedTarget.y - movedGeneratedTarget.y) < 1, "新增组件后已有组件关联文本的位置被重置");
  const datePreviewPoint = await stableScenePoint(target, "component-preview-C2");
  await evaluate(target, `document.querySelector('.preview-toggle')?.click(); true`);
  await waitFor(() => evaluate(target, `document.querySelectorAll('.preview-interaction-ring').length === 2`), "预览开关没有激活全部组件");
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('.static-overlay-runtime.is-component'))`), "日期组件运行页没有进入交互模式");
  await clickPoint(target, datePreviewPoint);
  const datePopup = await waitFor(() => evaluate(target, `(() => {
    const frame = document.querySelector('.prototype-overlay-shared iframe');
    const doc = frame?.contentDocument;
    const calendar = doc?.querySelector('.flatpickr-calendar.open');
    const input = doc?.querySelector('[data-component-id="reference-runtime-C2"] .cds--date-picker__input');
    const surface = doc?.querySelector('[data-component-id="reference-runtime-C2"].component-surface');
    if (!calendar || !input || !surface) return null;
    const rect = calendar.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      inputRect: { x: inputRect.x, y: inputRect.y, width: inputRect.width, height: inputRect.height },
      popupScale: rect.width / calendar.offsetWidth,
      componentScale: surfaceRect.width / surface.offsetWidth,
      parentHit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.tagName,
      style: calendar.getAttribute('style'),
      popupId: calendar.getAttribute('data-dockyard-reference-popup'),
    };
  })()`), "日期面板没有打开");
  process.stdout.write(`日期面板预览：${JSON.stringify(datePopup)}\n`);
  assert.ok(Math.abs(datePopup.popupScale - datePopup.componentScale) <= 0.03, "日期面板没有与原组件等比缩放");
  const popupBelow = Math.abs(datePopup.rect.y - datePopup.inputRect.y - datePopup.inputRect.height) <= 10;
  const popupAbove = Math.abs(datePopup.rect.y + datePopup.rect.height - datePopup.inputRect.y) <= 10;
  assert.ok(popupBelow || popupAbove, "日期面板没有锚定在输入框上下方");
  assert.equal(datePopup.parentHit, "IFRAME", "日期面板超出可交互裁剪区域");
  await screenshot(target, "date-picker-popup-scaled");
  const dateChoicePoint = await evaluate(target, `(() => {
    const button = document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('[aria-label="Friday, September 4, 2026"]');
    const rect = button?.getBoundingClientRect();
    return rect && { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  assert.ok(dateChoicePoint, "日期面板没有可选择的日期");
  await clickPoint(target, dateChoicePoint);
  await waitFor(() => evaluate(target, `document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('[data-component-id="reference-runtime-C2"] .cds--date-picker__input')?.value === '2026-09-04'`), "日期选择结果没有写回组件");
  await waitFor(() => evaluate(target, `!document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('.flatpickr-calendar.open')`), "选择日期后面板没有关闭");
  await clickPoint(target, datePreviewPoint);
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('.flatpickr-calendar.open'))`), "日期面板不能再次打开");
  await cdp(target, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp(target, "Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await waitFor(() => evaluate(target, `!document.querySelector('.preview-interaction-ring') && !document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('.flatpickr-calendar.open')`), "退出预览后日期面板仍然显示");

  await addAndConfirmComponent(target, "Checkbox");
  await addAndConfirmComponent(target, "Dropdown");
  await addAndConfirmComponent(target, "Toggle");
  await waitFor(() => evaluate(target, `document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelectorAll('.component-reference-viewport').length === 5`), "五个组件没有全部进入共享运行页");
  const overflowingHeaders = await evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    return window.__dockyardRelationPrototype.exportData.componentBindings.flatMap((binding) => {
      const card = scene.find((item) => item.id === binding.cardNodeId);
      const header = scene.find((item) => item.id === binding.id + '-library');
      return card && header && header.x + header.width <= card.x + card.width ? [] : [binding.id];
    });
  })()`);
  assert.deepEqual(overflowingHeaders, [], `组件信息超出卡片右边界：${overflowingHeaders.join(', ')}`);
  await evaluate(target, `window.__dockyardRelationPrototype.focusElements(['component-card-C4', 'component-card-C5']); true`);
  await delay(300);

  const cardOverlapDrag = await evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    const state = window.__dockyardRelationPrototype.getAppState();
    const moving = scene.find((item) => item.id === 'component-card-C5');
    const occupied = scene.find((item) => item.id === 'component-card-C4');
    const zoom = state.zoom.value;
    const start = { x: (moving.x + moving.width / 2 + state.scrollX) * zoom, y: (moving.y + 32 + state.scrollY) * zoom };
    return {
      start,
      end: {
        x: start.x + (occupied.x + occupied.width / 2 - moving.x - moving.width / 2) * zoom,
        y: start.y + (occupied.y + occupied.height / 2 - moving.y - moving.height / 2) * zoom,
      },
    };
  })()`);
  await clickPoint(target, cardOverlapDrag.start);
  await delay(100);
  await dragPoint(target, cardOverlapDrag.start, cardOverlapDrag.end, 22, "left");
  await delay(160);
  const cardCollision = await evaluate(target, `(() => {
    const scene = window.__dockyardRelationPrototype.getSceneElements();
    const moving = scene.find((item) => item.id === 'component-card-C5');
    const occupied = scene.find((item) => item.id === 'component-card-C4');
    const connector = scene.find((item) => item.id === 'component-link-C5');
    const overlaps = moving.x < occupied.x + occupied.width && moving.x + moving.width > occupied.x && moving.y < occupied.y + occupied.height && moving.y + moving.height > occupied.y;
    const verticalGap = Math.max(occupied.y - moving.y - moving.height, moving.y - occupied.y - occupied.height);
    return { overlaps, verticalGap, moving: { x: moving.x, y: moving.y }, occupied: { x: occupied.x, y: occupied.y }, connector: { isDeleted: connector.isDeleted, endBinding: connector.endBinding } };
  })()`);
  process.stdout.write(`卡片碰撞整理：${JSON.stringify(cardCollision)}\n`);
  assert.equal(cardCollision.overlaps, false, "组件卡片拖动后仍互相覆盖");
  assert.ok(cardCollision.verticalGap >= 15, "卡片自动插入后没有保留统一间距");
  assert.equal(cardCollision.connector.endBinding?.elementId, "component-card-C5", "卡片自动插入后关联箭头绑定丢失");
  await screenshot(target, "component-card-collision-arranged");
  await evaluate(target, `window.__dockyardRelationPrototype.focusElements(['component-card-C1', 'component-card-C2', 'component-card-C3', 'component-card-C4', 'component-card-C5']); true`);
  await delay(300);

  await evaluate(target, `document.querySelector('.preview-toggle')?.click(); true`);
  await waitFor(() => evaluate(target, `document.querySelectorAll('.preview-interaction-ring').length === 5`), "预览开关没有激活五个组件");
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('[data-component-id="reference-runtime-C5"].component-reference-viewport.is-interactive'))`), "第五个组件运行页没有完成交互状态切换");
  const allPreviewRegions = await evaluate(target, `(() => {
    const frame = document.querySelector('.prototype-overlay-shared iframe');
    const views = [...(frame?.contentDocument?.querySelectorAll('.component-reference-viewport') || [])];
    return views.map((view) => {
      const rect = view.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { id: view.dataset.componentId, width: rect.width, height: rect.height, parentHit: hit?.tagName || null };
    });
  })()`);
  process.stdout.write(`多组件预览区域：${JSON.stringify(allPreviewRegions)}\n`);
  assert.equal(allPreviewRegions.length, 5, "共享运行页缺少组件预览");
  assert.ok(allPreviewRegions.every((item) => item.width > 0 && item.height > 0 && item.parentHit === "IFRAME"), "激活一个组件后其余组件预览被共享裁剪区域隐藏");
  const visualAlignment = await evaluate(target, `(() => {
    const frame = document.querySelector('.prototype-overlay-shared iframe');
    const views = [...(frame?.contentDocument?.querySelectorAll('.component-reference-viewport') || [])];
    return views.map((view) => {
      const viewport = view.getBoundingClientRect();
      const roots = [...view.querySelectorAll('[data-dockyard-preview-root]')];
      const root = roots[0];
      if (roots.length !== 1 || !root) return { id: view.dataset.componentId, rootCount: roots.length, dx: Infinity, dy: Infinity };
      const content = root.getBoundingClientRect();
      const control = view.dataset.componentId === 'reference-runtime-C2'
        ? view.querySelector('.cds--date-picker__input')
        : view.dataset.componentId === 'reference-runtime-C4'
          ? view.querySelector('[role="combobox"]')
          : null;
      const controlRect = control?.getBoundingClientRect();
      const controlStyle = control ? getComputedStyle(control) : null;
      return {
        id: view.dataset.componentId,
        rootCount: roots.length,
        layout: root.dataset.previewLayout,
        dx: Math.abs((content.left + content.width / 2) - (viewport.left + viewport.width / 2)),
        dy: Math.abs((content.top + content.height / 2) - (viewport.top + viewport.height / 2)),
        controlDx: controlRect ? Math.abs((controlRect.left + controlRect.width / 2) - (content.left + content.width / 2)) : 0,
        controlWidthDelta: controlRect ? Math.abs(controlRect.width - content.width) : 0,
        controlInlineSize: controlStyle?.inlineSize,
        matchesFieldRule: control?.matches('.component-preview-root--field .cds--date-picker.cds--date-picker--single .cds--date-picker__input') || false,
        controlAncestors: control ? (() => {
          const nodes = [];
          let current = control;
          while (current && nodes.length < 5) { nodes.push(current.className); current = current.parentElement; }
          return nodes.join(' > ');
        })() : '',
        visibleLabels: [...view.querySelectorAll('.cds--label, .cds--checkbox-label, .cds--toggle__label')]
          .filter((label) => {
            const style = getComputedStyle(label);
            const rect = label.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          })
          .map((label) => label.textContent?.trim()),
      };
    });
  })()`);
  process.stdout.write(`组件预览根节点居中：${JSON.stringify(visualAlignment)}\n`);
  assert.ok(visualAlignment.every((item) => item.rootCount === 1 && item.dx <= 1 && item.dy <= 4), "组件预览根节点没有稳定居中");
  const fieldAlignment = visualAlignment.filter((item) => item.layout === 'field');
  assert.ok(fieldAlignment.every((item) => item.controlDx <= 1 && item.controlWidthDelta <= 1), "字段区域没有与真实控件同宽同中心");
  const labelExpectations = {
    'reference-runtime-C2': 'Date Picker',
    'reference-runtime-C3': 'Checkbox',
    'reference-runtime-C4': 'Dropdown',
    'reference-runtime-C5': 'Toggle',
  };
  assert.ok(visualAlignment
    .filter((item) => labelExpectations[item.id])
    .every((item) => item.visibleLabels?.some((label) => label?.includes(labelExpectations[item.id]))), "组件自身的文字标签没有显示在预览中");
  const previewPadding = await evaluate(target, `(() => {
    const frame = document.querySelector('.prototype-overlay-shared iframe');
    const views = [...(frame?.contentDocument?.querySelectorAll('.component-reference-viewport') || [])];
    return views.map((view) => {
      const viewport = view.getBoundingClientRect();
      const root = view.querySelector('[data-dockyard-preview-root]');
      const content = root?.getBoundingClientRect();
      return content ? {
        id: view.dataset.componentId,
        left: content.left - viewport.left,
        right: viewport.right - content.right,
        top: content.top - viewport.top,
        bottom: viewport.bottom - content.bottom,
      } : null;
    });
  })()`);
  process.stdout.write(`组件预览内边距：${JSON.stringify(previewPadding)}\n`);
  assert.ok(previewPadding.every((item) => item && item.left >= 2 && item.right >= 2 && item.top >= 2 && item.bottom >= 2), "缩小后的组件没有保留预览矩形内边距");
  await screenshot(target, "five-components-remain-visible");
  await evaluate(target, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); true`);
  await waitFor(() => evaluate(target, `!document.querySelector('.preview-interaction-ring')`), "切换到下拉框前没有退出预览交互状态");

  const dropdownPreviewPoint = await stableScenePoint(target, "component-preview-C4");
  await evaluate(target, `document.querySelector('.preview-toggle')?.click(); true`);
  await waitFor(() => evaluate(target, `document.querySelectorAll('.preview-interaction-ring').length === 5`), "下拉框验收时没有开启预览交互");
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('[data-component-id="reference-runtime-C4"].component-reference-viewport.is-interactive'))`), "下拉框运行页没有完成交互状态切换");
  const dropdownTriggerPoint = await waitFor(() => evaluate(target, `(() => {
    const trigger = document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('[data-component-id="reference-runtime-C4"] [role="combobox"]');
    const rect = trigger?.getBoundingClientRect();
    return rect && { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`), "下拉框触发区域不存在");
  await clickPoint(target, dropdownTriggerPoint);
  const dropdownMenu = await waitFor(() => evaluate(target, `(() => {
    const frame = document.querySelector('.prototype-overlay-shared iframe');
    const doc = frame?.contentDocument;
    const viewport = doc?.querySelector('[data-component-id="reference-runtime-C4"].component-reference-viewport');
    const menu = viewport?.querySelector('.cds--list-box__menu');
    const option = [...(menu?.querySelectorAll('[role="option"]') || [])].find((item) => item.textContent?.includes('Option Two'));
    if (!viewport || !menu || !option) return null;
    const viewportRect = viewport.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    return {
      viewport: { x: viewportRect.x, y: viewportRect.y, width: viewportRect.width, height: viewportRect.height },
      menu: { x: menuRect.x, y: menuRect.y, width: menuRect.width, height: menuRect.height },
      optionPoint: { x: optionRect.x + optionRect.width / 2, y: optionRect.y + optionRect.height / 2 },
      parentHit: document.elementFromPoint(optionRect.x + optionRect.width / 2, optionRect.y + optionRect.height / 2)?.tagName || null,
    };
  })()`), "下拉选项没有展开");
  process.stdout.write(`下拉框溢出预览：${JSON.stringify(dropdownMenu)}\n`);
  assert.ok(dropdownMenu.menu.y + dropdownMenu.menu.height > dropdownMenu.viewport.y + dropdownMenu.viewport.height, "下拉菜单仍被限制在预览矩形中");
  assert.equal(dropdownMenu.parentHit, "IFRAME", "溢出的下拉选项不在可交互区域内");
  await screenshot(target, "dropdown-overflow-visible");
  await clickPoint(target, dropdownMenu.optionPoint);
  await waitFor(() => evaluate(target, `document.querySelector('.prototype-overlay-shared iframe')?.contentDocument?.querySelector('[data-component-id="reference-runtime-C4"] .cds--list-box__label')?.textContent?.includes('Option Two')`), "下拉选项不能完成选择");
  await cdp(target, "Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp(target, "Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await waitFor(() => evaluate(target, `!document.querySelector('.preview-interaction-ring')`), "关系清单验收前没有退出预览交互");
  await evaluate(target, `document.querySelector('.relation-status > button:last-child')?.click(); true`);
  await waitFor(() => evaluate(target, `Boolean(document.querySelector('.relation-summary'))`), "图稿关系清单没有打开");
  await evaluate(target, `document.querySelector('[aria-label="删除C5组件关联"]')?.click(); true`);
  await waitFor(() => evaluate(target, `window.__dockyardRelationPrototype.exportData.componentBindings.length === 4`), "无法从图稿关系中删除组件关联");
  assert.equal(await evaluate(target, `Boolean(window.__dockyardRelationPrototype.getSceneElements().find((item) => item.id === 'component-card-C5' || item.id === 'component-link-C5'))`), false, "删除组件关系后画板仍保留卡片或箭头");
  await evaluate(target, `document.querySelector('[aria-label="删除I1交互关系"]')?.click(); true`);
  await waitFor(() => evaluate(target, `window.__dockyardRelationPrototype.exportData.interactions.length === 0`), "无法从图稿关系中删除交互关系");
  assert.equal(await evaluate(target, `Boolean(window.__dockyardRelationPrototype.getSceneElements().find((item) => item.id === 'interaction-arrow-I1'))`), false, "删除交互关系后画板仍保留箭头");
  await screenshot(target, "relation-summary-delete");
  process.stdout.write(`原型关系专用验收通过，证据目录：${evidenceDir}\n`);
} catch (error) {
  failure = error;
  if (target) {
    try {
      const diagnostic = await evaluate(target, `(() => ({
        url: location.href,
        bodyText: document.body.innerText.slice(0, 1200),
        state: window.__dockyardRelationPrototype?.getAppState?.(),
        scene: window.__dockyardRelationPrototype?.getSceneElements?.()?.filter((item) => item.id.startsWith('interaction-') || item.id === 'component-preview-C1').map((item) => ({id:item.id, x:item.x, y:item.y, width:item.width, height:item.height, angle:item.angle, points:item.points})),
        buttons: [...document.querySelectorAll('button')].map((item) => ({label:item.getAttribute('aria-label'), text:item.textContent})).filter((item) => item.label || item.text),
        runtime: (() => {
          const frame = document.querySelector('.prototype-overlay-shared iframe');
          const runtime = frame?.contentDocument?.querySelector('.static-overlay-runtime');
          const button = frame?.contentDocument?.querySelector('.cds--btn');
          const rect = button?.getBoundingClientRect();
          return { className: runtime?.className, buttonText: button?.textContent, buttonRect: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
        })()
      }))()`);
      process.stderr.write(`验收失败现场：${JSON.stringify(diagnostic)}\n`);
      await screenshot(target, "failure");
    } catch (diagnosticError) {
      process.stderr.write(`验收失败诊断不可用：${diagnosticError.message}\n`);
    }
  }
} finally {
  if (browser?.pid) spawnSync("taskkill.exe", ["/pid", String(browser.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
  if (vite?.pid) spawnSync("taskkill.exe", ["/pid", String(vite.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
}
if (failure) throw failure;

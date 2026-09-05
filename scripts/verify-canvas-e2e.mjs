import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const verificationRoot = join(
  tmpdir(),
  `dockyard-canvas-e2e-${process.pid}-${Date.now()}`,
);
const dataRoot = join(verificationRoot, "data");
const userDataRoot = join(verificationRoot, "user-data");
const fixtureProject = join(verificationRoot, "fixture-project");
const fixtureDockyard = join(fixtureProject, ".dockyard");
const artworkId = "artwork-canvas-e2e";
const workspaceId = "workspace-canvas-e2e";
const electronBin = join(
  projectRoot,
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron",
);
const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function prepareFixture() {
  const createdAt = new Date().toISOString();
  const scenePath = `drafts/${artworkId}/scene.excalidraw.json`;
  mkdirSync(fixtureProject, { recursive: true });
  mkdirSync(userDataRoot, { recursive: true });
  writeJson(join(fixtureDockyard, scenePath), {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements: [],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  });
  writeJson(join(fixtureDockyard, "design.json"), {
    version: 3,
    id: workspaceId,
    name: "画板自动验收",
    updatedAt: createdAt,
    currentArtworkId: artworkId,
    artworks: [
      {
        id: artworkId,
        name: "自动验收画稿",
        status: "draft",
        createdAt,
        updatedAt: createdAt,
        source: null,
        scenePath,
        annotations: [],
        components: [],
        notes: "",
      },
    ],
    bases: [],
    libraryItems: [],
    preferredLibraries: ["shadcn/ui"],
  });
  writeJson(join(fixtureDockyard, "workspace.json"), {
    version: 1,
    id: workspaceId,
    name: "画板自动验收",
    updatedAt: createdAt,
  });
  writeJson(join(dataRoot, "index.json"), {
    version: 2,
    currentProjectPath: fixtureProject,
    currentWorkspaceId: workspaceId,
    recentProjects: [
      {
        path: fixtureProject,
        name: basename(fixtureProject),
        workspaceId,
        lastUsedAt: createdAt,
      },
    ],
    windowState: {},
  });
}

async function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) =>
        error || !port ? reject(error || new Error("没有可用调试端口")) : resolvePort(port),
      );
    });
  });
}

async function cdp(target, method, params = {}) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveSocket, reject) => {
    socket.addEventListener("open", resolveSocket, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return new Promise((resolveResult, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`调试命令超时：${method}`));
    }, 10_000);
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.error) reject(new Error(message.error.message));
      else resolveResult(message.result);
    });
    socket.send(JSON.stringify({ id: 1, method, params }));
  });
}

async function evaluate(target, expression) {
  const result = await cdp(target, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        "页面脚本执行失败",
    );
  }
  return result.result.value;
}

function findStaticRuntimeFrame(frameTree) {
  if (frameTree.frame.url.startsWith("dockyard-static://components/runtime.html"))
    return frameTree.frame;
  for (const child of frameTree.childFrames || []) {
    const found = findStaticRuntimeFrame(child);
    if (found) return found;
  }
  return null;
}

async function frameEvaluate(target, expression) {
  const runtimeTarget = (await application?.targets?.())?.find((item) =>
    item.url.startsWith("dockyard-static://components/runtime.html"),
  );
  if (runtimeTarget) return evaluate(runtimeTarget, expression);
  const { frameTree } = await cdp(target, "Page.getFrameTree");
  const frame = findStaticRuntimeFrame(frameTree);
  if (!frame) {
    const urls = (await application?.targets?.())?.map((item) => item.url) || [];
    throw new Error(`没有找到静态组件运行页：${JSON.stringify(urls)}`);
  }
  const { executionContextId } = await cdp(target, "Page.createIsolatedWorld", {
    frameId: frame.id,
    worldName: "dockyard-canvas-e2e",
  });
  const result = await cdp(target, "Runtime.evaluate", {
    expression,
    contextId: executionContextId,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        "静态运行页脚本执行失败",
    );
  }
  return result.result.value;
}

async function waitFor(read, message, timeoutMs = 15_000) {
  const startedAt = Date.now();
  let lastValue;
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      lastValue = await read();
      if (lastValue) return lastValue;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  const detail = lastError?.message || JSON.stringify(lastValue);
  throw new Error(`${message}${detail ? `：${detail}` : ""}`);
}

async function runStage(name, action) {
  process.stdout.write(`→ ${name}\n`);
  try {
    const result = await action();
    process.stdout.write(`✓ ${name}\n`);
    return result;
  } catch (error) {
    throw new Error(`${name}失败：${error instanceof Error ? error.message : error}`, {
      cause: error,
    });
  }
}

async function launch() {
  const port = await availablePort();
  const output = { value: "" };
  const child = spawn(
    electronBin,
    [
      projectRoot,
      "--dockyard-prod",
      `--remote-debugging-port=${port}`,
      "--disable-gpu",
      "--disable-gpu-compositing",
    ],
    {
      cwd: verificationRoot,
      env: {
        ...process.env,
        DOCKYARD_DATA_DIR: dataRoot,
        DOCKYARD_USER_DATA_DIR: userDataRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      output.value = `${output.value}${chunk}`.slice(-12_000);
    });
  }
  child.once("error", (error) => {
    output.value += `\n${error.stack || error.message}`;
  });
  const endpoint = `http://127.0.0.1:${port}/json/list`;
  const targets = async () => {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`调试端点返回 ${response.status}`);
    return response.json();
  };
  const bar = await waitFor(
    async () => (await targets()).find((item) => item.url.includes("view=bar")),
    `等待工具条页面超时\n${output.value}`,
  );
  await waitFor(
    () => evaluate(
      bar,
      "document.readyState === 'complete' && Boolean(window.dockyard)",
    ),
    "工具条页面没有完成加载",
  );
  return { child, output, targets, bar };
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else child.kill("SIGKILL");
}

function trashVerificationRoot() {
  const expectedParent = resolve(tmpdir());
  const target = resolve(verificationRoot);
  if (
    dirname(target) !== expectedParent ||
    !basename(target).startsWith("dockyard-canvas-e2e-")
  ) throw new Error(`拒绝清理非验收目录：${target}`);
  if (!existsSync(target)) return;
  const trashTarget = target.replaceAll("\\", "/");
  const result = process.platform === "win32"
    ? spawnSync(
        process.env.ComSpec || "cmd.exe",
        ["/d", "/s", "/c", "trash.cmd", trashTarget],
        { encoding: "utf8", windowsHide: true },
      )
    : spawnSync("trash", [target], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `临时状态移入回收站失败：${result.stderr || result.stdout || result.error}`,
    );
  }
  if (existsSync(target)) throw new Error(`临时状态仍然存在：${target}`);
}

async function pointerGesture(target, componentId, selector, dx, dy) {
  await frameEvaluate(target, `(() => {
    const surface = [...document.querySelectorAll('[data-component-id]')]
      .find((item) => item.dataset.componentId === ${JSON.stringify(componentId)});
    const handle = surface?.querySelector(${JSON.stringify(selector)});
    if (!handle) throw new Error('没有找到组件操作点：${selector}');
    handle.setPointerCapture = () => {};
    const rect = handle.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const pointer = (type, x, y, buttons) => handle.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: x,
        clientY: y,
        button: 0,
        buttons,
      }),
    );
    pointer('pointerdown', startX, startY, 1);
    for (let step = 1; step <= 6; step += 1) {
      pointer('pointermove', startX + (${dx} * step) / 6, startY + (${dy} * step) / 6, 1);
    }
    pointer('pointerup', startX + ${dx}, startY + ${dy}, 0);
    return true;
  })()`);
  await delay(200);
}

async function rotateGesture(target, componentId, rotation) {
  await frameEvaluate(target, `(() => {
    const surface = [...document.querySelectorAll('[data-component-id]')]
      .find((item) => item.dataset.componentId === ${JSON.stringify(componentId)});
    const handle = surface?.querySelector('.component-rotate-handle');
    if (!handle) throw new Error('没有找到组件旋转操作点');
    handle.setPointerCapture = () => {};
    const surfaceRect = surface.getBoundingClientRect();
    const handleRect = handle.getBoundingClientRect();
    const startX = handleRect.left + handleRect.width / 2;
    const startY = handleRect.top + handleRect.height / 2;
    const centerX = surfaceRect.left + surfaceRect.width / 2;
    const centerY = surfaceRect.top + surfaceRect.height / 2;
    const radius = 100;
    const endX = centerX + Math.cos(${rotation} - Math.PI / 2) * radius;
    const endY = centerY + Math.sin(${rotation} - Math.PI / 2) * radius;
    const pointer = (type, x, y, buttons) => handle.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: x,
      clientY: y,
      button: 0,
      buttons,
    }));
    pointer('pointerdown', startX, startY, 1);
    pointer('pointermove', endX, endY, 1);
    pointer('pointerup', endX, endY, 0);
    return true;
  })()`);
  await delay(200);
}

async function geometry(target, componentId) {
  return frameEvaluate(target, `(() => {
    const surface = [...document.querySelectorAll('[data-component-id]')]
      .find((item) => item.dataset.componentId === ${JSON.stringify(componentId)});
    if (!surface) return null;
    return {
      width: Number.parseFloat(surface.style.width),
      height: Number.parseFloat(surface.style.height),
      transform: surface.style.transform,
    };
  })()`);
}

let application;
let failure;
try {
  await runStage("准备独立临时项目", async () => {
    for (const required of [
      electronBin,
      join(projectRoot, "dist", "index.html"),
      join(projectRoot, "dist-electron", "electron", "main.js"),
      join(projectRoot, "dist", "static-component-overlay", "runtime.html"),
    ]) assert.ok(existsSync(required), `缺少构建产物：${required}`);
    prepareFixture();
  });

  application = await runStage("自动启动真实桌面应用", launch);
  let annotator = await runStage("进入真实画板", async () => {
    await evaluate(
      application.bar,
      "window.dockyard.openPanel('annotator').then(() => true)",
    );
    const target = await waitFor(
      async () =>
        (await application.targets()).find((item) => item.url.includes("view=annotator")),
      "等待画板窗口超时",
    );
    await waitFor(
      () => evaluate(
        target,
        "Boolean(document.querySelector('.excalidraw-wrap') && document.querySelector('[data-testid=toolbar-component]') && document.querySelector('.component-inventory'))",
      ),
      "真实画板没有完成渲染",
    );
    await evaluate(target, `(() => {
      window.__dockyardContractMessages = [];
      addEventListener('message', (event) => {
        if (event.data?.protocol === 'dockyard-overlay') window.__dockyardContractMessages.push(event.data);
      });
      return true;
    })()`);
    return target;
  });

  const componentId = await runStage("在真实画板创建静态组件", async () => {
    const dispatched = await evaluate(annotator, `(() => {
      const canvas = document.querySelector('.excalidraw-wrap');
      if (!canvas) throw new Error('没有找到真实画板');
      const transfer = new DataTransfer();
      transfer.setData('application/x-dockyard-story', JSON.stringify({
        id: 'carbon-button',
        title: 'actions / button',
        name: 'Button',
        type: 'story',
        sourceId: 'carbon-react',
        storyUrl: '',
      }));
      const rect = canvas.getBoundingClientRect();
      return canvas.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        dataTransfer: transfer,
      }));
    })()`);
    assert.equal(dispatched, false, "组件投放事件没有被画板接收");
    const insertedId = await waitFor(
      () => evaluate(annotator, `window.dockyard.loadWorkspace().then((workspace) =>
        workspace.artworks.find((item) => item.id === ${JSON.stringify(artworkId)})
          ?.components?.[0]?.instanceId || null
      )`),
      "画板没有把静态组件加入工作区",
    );
    const renderedId = await waitFor(
      () => frameEvaluate(annotator, `(() => {
        const component = document.querySelector('[data-component-id]');
        const button = component?.querySelector('.cds--btn');
        return component && button ? component.dataset.componentId : null;
      })()`),
      "静态组件运行页没有渲染 Button",
    );
    assert.equal(renderedId, insertedId, "运行页组件与工作区实例不一致");
    const storedContract = await evaluate(annotator, `window.dockyard.loadWorkspace().then((workspace) => {
      const component = workspace.artworks.find((item) => item.id === ${JSON.stringify(artworkId)})?.components?.[0];
      return component ? { staticModule: component.staticModule, sourceLibraryId: component.sourceLibraryId } : null;
    })`);
    assert.deepEqual(storedContract, {
      sourceLibraryId: "carbon-react",
      staticModule: {
        sourceId: "carbon-react",
        componentKey: "carbon-button",
        protocolVersion: "1",
        version: "0.1.0",
      },
    }, "工作区没有按来源标识保存静态实例契约");
    await frameEvaluate(annotator, `(() => {
      window.__dockyardHostMessages = [];
      addEventListener('message', (event) => {
        if (event.data?.protocol === 'dockyard-overlay') window.__dockyardHostMessages.push(event.data);
      });
      return true;
    })()`);
    return renderedId;
  });

  await runStage("验证组件内部交互", async () => {
    const values = await frameEvaluate(annotator, `(() => {
      const button = document.querySelector('[data-component-id] .cds--btn');
      const before = button.textContent;
      button.click();
      return new Promise((resolve) => requestAnimationFrame(() =>
        resolve({ before, after: button.textContent })
      ));
    })()`);
    assert.match(values.before, /\(0\)/, "按钮初始状态不正确");
    assert.match(values.after, /\(1\)/, "按钮点击没有更新内部状态");
  });

  await runStage("验证工具切换和透明层级", async () => {
    const runtimeState = await frameEvaluate(annotator, `(() => {
      const surface = document.querySelector('[data-component-id]');
      const rect = surface.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        rootBackground: getComputedStyle(document.querySelector('#root')).backgroundColor,
      };
    })()`);
    const state = await evaluate(annotator, `(() => {
      const componentTool = document.querySelector('[data-testid=toolbar-component]');
      componentTool.click();
      const componentActive = componentTool.checked;
      const rectangleTool = document.querySelector('[data-testid=toolbar-rectangle]');
      rectangleTool.click();
      const rectangleActive = rectangleTool.checked && !componentTool.checked;
      componentTool.click();
      const frame = document.querySelector('.prototype-overlay-shared iframe');
      const host = document.querySelector('[data-dockyard-overlay-host]');
      const layerUi = document.querySelector('.layer-ui__wrapper');
      const interactiveCanvas = document.querySelector('canvas.interactive');
      const zIndex = (node) => Number(node ? getComputedStyle(node).zIndex : 0);
      const controlsZ = Number(getComputedStyle(host.parentElement)
        .getPropertyValue('--zIndex-canvasButtons'));
      return {
        componentActive,
        rectangleActive,
        componentRestored: componentTool.checked,
        hostCount: document.querySelectorAll('[data-dockyard-overlay-host]').length,
        hostInsideCanvas: host.parentElement.classList.contains('excalidraw'),
        aboveCanvas: zIndex(host) >= zIndex(interactiveCanvas),
        belowUi: zIndex(host) < zIndex(layerUi),
        belowControls: zIndex(host) < controlsZ,
        overlayAtComponent: document.elementFromPoint(
          ${JSON.stringify(runtimeState.x)},
          ${JSON.stringify(runtimeState.y)},
        ) === frame,
      };
    })()`);
    assert.deepEqual(state, {
      componentActive: true,
      rectangleActive: true,
      componentRestored: true,
      hostCount: 1,
      hostInsideCanvas: true,
      aboveCanvas: true,
      belowUi: true,
      belowControls: true,
      overlayAtComponent: true,
    });
    assert.deepEqual(runtimeState, {
      x: runtimeState.x,
      y: runtimeState.y,
      htmlBackground: "rgba(0, 0, 0, 0)",
      bodyBackground: "rgba(0, 0, 0, 0)",
      rootBackground: "rgba(0, 0, 0, 0)",
    });
  });

  const finalGeometry = await runStage("验证移动、旋转和旋转后缩放", async () => {
    const initial = await geometry(annotator, componentId);
    await pointerGesture(annotator, componentId, ".component-sequence", 42, 28);
    const moved = await geometry(annotator, componentId);
    assert.notEqual(moved.transform, initial.transform, "移动后位置没有变化");

    await rotateGesture(annotator, componentId, Math.PI / 2);
    const rotated = await geometry(annotator, componentId);
    assert.notEqual(rotated.transform, moved.transform, "旋转后角度没有变化");

    await pointerGesture(annotator, componentId, ".component-resize-handle", -22, 36);
    const resized = await geometry(annotator, componentId);
    assert.ok(Math.abs(resized.width - rotated.width - 36) < 0.01, `旋转后视觉宽度拖动结果错误：${rotated.width} → ${resized.width}`);
    assert.ok(Math.abs(resized.height - rotated.height - 22) < 0.01, `旋转后视觉高度拖动结果错误：${rotated.height} → ${resized.height}`);
    return resized;
  });

  await runStage("验证版本化消息和五个内置组件", async () => {
    const componentKeys = ["carbon-date-picker", "carbon-checkbox", "carbon-dropdown", "carbon-toggle"];
    for (let index = 0; index < componentKeys.length; index += 1) {
      const componentKey = componentKeys[index];
      const dispatched = await evaluate(annotator, `(() => {
        const canvas = document.querySelector('.excalidraw-wrap');
        const transfer = new DataTransfer();
        transfer.setData('application/x-dockyard-story', JSON.stringify({
          id: ${JSON.stringify(componentKey)},
          title: 'contract / built-in',
          name: ${JSON.stringify(componentKey)},
          type: 'story',
          sourceId: 'carbon-react',
          storyUrl: '',
        }));
        const rect = canvas.getBoundingClientRect();
        return canvas.dispatchEvent(new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 120 + ${index} * 80,
          clientY: rect.top + 120 + ${index} * 60,
          dataTransfer: transfer,
        }));
      })()`);
      assert.equal(dispatched, false, `组件投放事件没有被接收：${componentKey}`);
      await waitFor(
        () => evaluate(annotator, `window.dockyard.loadWorkspace().then((workspace) =>
          workspace.artworks.find((item) => item.id === ${JSON.stringify(artworkId)})?.components?.length === ${index + 2}
        )`),
        `工作区没有保存组件：${componentKey}`,
      );
    }
    const rendered = await waitFor(
      () => frameEvaluate(annotator, `(() => {
        const components = [...document.querySelectorAll('[data-component-key]')]
          .map((item) => ({ key: item.dataset.componentKey, sourceId: item.dataset.sourceId }))
          .sort((a, b) => a.key.localeCompare(b.key));
        return components.length === 5 ? components : null;
      })()`),
      "五个内置组件没有全部渲染",
    );
    assert.deepEqual(rendered, [
      "carbon-button",
      "carbon-checkbox",
      "carbon-date-picker",
      "carbon-dropdown",
      "carbon-toggle",
    ].map((key) => ({ key, sourceId: "carbon-react" })));

    const runtimeMessages = await evaluate(annotator, "window.__dockyardContractMessages");
    assert.ok(runtimeMessages.length > 0, "没有观察到运行页消息");
    const invalidRuntimeMessages = runtimeMessages.filter((message) => message.protocol !== "dockyard-overlay" || message.version !== "1" || message.sourceId !== "carbon-react");
    assert.deepEqual(invalidRuntimeMessages, [], `运行页消息缺少协议版本或来源标识：${JSON.stringify(invalidRuntimeMessages)}`);
    const instanceEvents = new Set(["component-click", "date-change", "checkbox-change", "dropdown-change", "toggle-change", "component-move", "component-drop", "component-bounds"]);
    assert.ok(runtimeMessages.filter((message) => instanceEvents.has(message.type)).every((message) => typeof message.componentId === "string" && message.componentId), "实例事件缺少实例标识");

    const hostMessages = await frameEvaluate(annotator, "window.__dockyardHostMessages");
    assert.ok(hostMessages.length > 0, "没有观察到宿主命令");
    const invalidHostMessages = hostMessages.filter((message) => message.protocol !== "dockyard-overlay" || message.version !== "1" || message.sourceId !== "carbon-react");
    assert.deepEqual(invalidHostMessages, [], `宿主命令缺少协议版本或来源标识：${JSON.stringify(invalidHostMessages)}`);
    assert.ok(hostMessages.filter((message) => message.type === "set-instances").every((message) => message.instances.every((instance) => typeof instance.id === "string" && instance.id)), "实例同步命令缺少实例标识");
  });

  await runStage("保存并重新打开画稿", async () => {
    const saved = await evaluate(annotator, `window.dockyard.loadWorkspace()
      .then((workspace) => window.dockyard.saveWorkspace(workspace))`);
    assert.equal(saved.ok, true, saved.error || "工作区保存失败");
    const persisted = JSON.parse(
      readFileSync(join(fixtureDockyard, "design.json"), "utf8"),
    );
    assert.equal(
      persisted.artworks[0].components.length,
      5,
      "保存文件没有包含五个静态组件",
    );

    await evaluate(application.bar, "window.dockyard.closePanel('annotator').then(() => true)");
    await waitFor(
      async () =>
        !(await application.targets()).some((item) => item.url.includes("view=annotator")),
      "关闭画板窗口超时",
    );
    await evaluate(application.bar, "window.dockyard.openPanel('annotator').then(() => true)");
    annotator = await waitFor(
      async () =>
        (await application.targets()).find((item) => item.url.includes("view=annotator")),
      "重新打开画板窗口超时",
    );
    await waitFor(
      () => geometry(annotator, componentId),
      "重新打开后静态组件没有恢复",
    );
    assert.deepEqual(
      await geometry(annotator, componentId),
      finalGeometry,
      "重新打开后组件几何状态没有恢复",
    );
  });

  process.stdout.write("真实画板完整组件路径验收通过。\n");
} catch (error) {
  failure = error;
} finally {
  stop(application?.child);
  await delay(200);
  try {
    trashVerificationRoot();
  } catch (cleanupError) {
    if (failure) {
      process.stderr.write(
        `清理失败：${cleanupError instanceof Error ? cleanupError.message : cleanupError}\n`,
      );
    } else failure = cleanupError;
  }
}

if (failure) {
  const appOutput = application?.output.value.trim();
  throw new Error(
    `${failure instanceof Error ? failure.message : failure}${appOutput ? `\n应用输出：\n${appOutput}` : ""}`,
    { cause: failure },
  );
}

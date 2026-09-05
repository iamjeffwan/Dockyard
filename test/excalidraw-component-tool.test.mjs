import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTypeScriptModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const { nativeExcalidrawToolForShortcut } = await loadTypeScriptModule(
  "../src/excalidraw/component-tool-shortcuts.ts",
);
const { OVERLAY_PROTOCOL, OVERLAY_PROTOCOL_VERSION, OverlayEvent, validateProtocolMessage } = await import(
  "../prototypes/static-component-overlay/source-contract.js"
);

test("原生画板工具快捷键会退出组件交互模式", () => {
  assert.equal(nativeExcalidrawToolForShortcut({ key: "r" }), "rectangle");
  assert.equal(nativeExcalidrawToolForShortcut({ key: "V" }), "selection");
  assert.equal(nativeExcalidrawToolForShortcut({ key: "2" }), "rectangle");
});

test("组合键和编辑区域输入不会切换画板工具", () => {
  assert.equal(nativeExcalidrawToolForShortcut({ key: "r", ctrlKey: true }), null);
  assert.equal(nativeExcalidrawToolForShortcut({ key: "2", altKey: true }), null);
  assert.equal(nativeExcalidrawToolForShortcut({ key: "v", editable: true }), null);
  assert.equal(nativeExcalidrawToolForShortcut({ key: "x" }), null);
});

test("快捷键解析为同一次操作中应激活的原生工具", () => {
  assert.equal(nativeExcalidrawToolForShortcut({ key: "r" }), "rectangle");
  assert.equal(nativeExcalidrawToolForShortcut({ key: "2" }), "rectangle");
  assert.equal(nativeExcalidrawToolForShortcut({ key: "v" }), "selection");
  assert.equal(nativeExcalidrawToolForShortcut({ key: "f" }), "frame");
  assert.equal(nativeExcalidrawToolForShortcut({ key: "x" }), null);
});

test("共享运行页只接受带快捷键内容的工具切换消息", () => {
  assert.equal(
    validateProtocolMessage({
      protocol: OVERLAY_PROTOCOL,
      version: OVERLAY_PROTOCOL_VERSION,
      sourceId: "carbon-react",
      type: OverlayEvent.nativeToolShortcut,
      key: "r",
    }, { sourceId: "carbon-react", direction: "runtime" }).ok,
    true,
  );
  assert.equal(
    validateProtocolMessage({
      protocol: OVERLAY_PROTOCOL,
      version: OVERLAY_PROTOCOL_VERSION,
      sourceId: "carbon-react",
      type: OverlayEvent.nativeToolShortcut,
    }, { sourceId: "carbon-react", direction: "runtime" }).ok,
    false,
  );
});

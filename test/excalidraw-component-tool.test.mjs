import assert from "node:assert/strict";
import test from "node:test";
import {
  isNativeExcalidrawToolShortcut,
  nativeExcalidrawToolForShortcut,
} from "../src/excalidraw/component-tool-shortcuts.ts";

test("原生画板工具快捷键会退出组件交互模式", () => {
  assert.equal(isNativeExcalidrawToolShortcut({ key: "r" }), true);
  assert.equal(isNativeExcalidrawToolShortcut({ key: "V" }), true);
  assert.equal(isNativeExcalidrawToolShortcut({ key: "2" }), true);
});

test("组合键和编辑区域输入不会切换画板工具", () => {
  assert.equal(isNativeExcalidrawToolShortcut({ key: "r", ctrlKey: true }), false);
  assert.equal(isNativeExcalidrawToolShortcut({ key: "2", altKey: true }), false);
  assert.equal(isNativeExcalidrawToolShortcut({ key: "v", editable: true }), false);
  assert.equal(isNativeExcalidrawToolShortcut({ key: "x" }), false);
});

test("快捷键解析为同一次操作中应激活的原生工具", () => {
  assert.equal(nativeExcalidrawToolForShortcut({ key: "r" }), "rectangle");
  assert.equal(nativeExcalidrawToolForShortcut({ key: "2" }), "rectangle");
  assert.equal(nativeExcalidrawToolForShortcut({ key: "v" }), "selection");
  assert.equal(nativeExcalidrawToolForShortcut({ key: "f" }), "frame");
  assert.equal(nativeExcalidrawToolForShortcut({ key: "x" }), null);
});

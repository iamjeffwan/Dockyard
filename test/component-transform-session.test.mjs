import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../prototypes/static-component-overlay/transform-session.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { beginTransformSession, updateTransformSession } = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

const initial = { x: 100, y: 80, width: 120, height: 48, rotation: 0 };

test("编号拖动按画板缩放换算位移，且不依赖 Alt 键", () => {
  const session = beginTransformSession("move", initial, { x: 20, y: 30 });

  const next = updateTransformSession(session, { x: 80, y: 70 }, { zoom: 2 });

  assert.deepEqual(next, { x: 130, y: 100, width: 120, height: 48, rotation: 0 });
});

test("缩放保持最小尺寸，旋转可按 Shift 吸附到 15 度", () => {
  const resize = beginTransformSession("resize", initial, { x: 100, y: 100 });
  assert.deepEqual(
    updateTransformSession(resize, { x: -200, y: -200 }, { zoom: 1 }),
    { x: 100, y: 80, width: 24, height: 24, rotation: 0 },
  );

  const rotate = beginTransformSession("rotate", initial, { x: 160, y: 20 }, { x: 160, y: 104 });
  const next = updateTransformSession(rotate, { x: 244, y: 104 }, { zoom: 1, snapRotation: true });
  assert.equal(next.rotation, Math.PI / 2);
});

test("取消操作可恢复会话开始时的几何信息", () => {
  const session = beginTransformSession("move", initial, { x: 20, y: 30 });
  updateTransformSession(session, { x: 80, y: 70 }, { zoom: 1 });

  assert.deepEqual(session.initial, initial);
  assert.deepEqual(session.current, { x: 160, y: 120, width: 120, height: 48, rotation: 0 });
});

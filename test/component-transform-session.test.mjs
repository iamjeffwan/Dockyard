import assert from "node:assert/strict";
import test from "node:test";
import {
  beginTransformSession,
  updateTransformSession,
} from "../prototypes/static-component-overlay/transform-session.js";

const initial = { x: 100, y: 80, width: 120, height: 48, rotation: 0 };
const closeTo = (actual, expected, name) => assert.ok(
  Math.abs(actual - expected) < 0.000_001,
  `${name}：期望 ${expected}，实际 ${actual}`,
);

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

test("缩放位移在零度、四十五度、九十度和不同画布缩放下转换到组件局部坐标", () => {
  const cases = [
    { name: "零度 / 100%", rotation: 0, zoom: 1, pointer: { x: 140, y: 120 } },
    { name: "四十五度 / 100%", rotation: Math.PI / 4, zoom: 1, pointer: { x: 114.1421356237, y: 142.4264068712 } },
    { name: "九十度 / 100%", rotation: Math.PI / 2, zoom: 1, pointer: { x: 80, y: 140 } },
    { name: "四十五度 / 200%", rotation: Math.PI / 4, zoom: 2, pointer: { x: 128.2842712475, y: 184.8528137424 } },
  ];

  for (const example of cases) {
    const session = beginTransformSession(
      "resize",
      { ...initial, rotation: example.rotation },
      { x: 100, y: 100 },
    );
    const next = updateTransformSession(session, example.pointer, { zoom: example.zoom });
    closeTo(next.width, 160, example.name);
    closeTo(next.height, 68, example.name);
  }
});

test("取消操作可恢复会话开始时的几何信息", () => {
  const session = beginTransformSession("move", initial, { x: 20, y: 30 });
  updateTransformSession(session, { x: 80, y: 70 }, { zoom: 1 });

  assert.deepEqual(session.initial, initial);
  assert.deepEqual(session.current, { x: 160, y: 120, width: 120, height: 48, rotation: 0 });
});

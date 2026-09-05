import assert from "node:assert/strict";
import test from "node:test";

import {
  BAR_SIZE,
  resolveBarPosition,
} from "../dist-electron/electron/window-position.js";

const primary = { x: 0, y: 0, width: 1920, height: 1040 };
const secondary = { x: -1280, y: 0, width: 1280, height: 984 };

test("没有保存位置时工具条位于主工作区右下角", () => {
  assert.deepEqual(
    resolveBarPosition({ primaryWorkArea: primary, workAreas: [primary] }),
    {
      x: primary.x + primary.width - BAR_SIZE.width - 24,
      y: primary.y + primary.height - BAR_SIZE.height - 32,
    },
  );
});

test("有效保存位置保持在原显示器", () => {
  const saved = { x: -900, y: 220 };
  assert.deepEqual(
    resolveBarPosition({
      saved,
      primaryWorkArea: primary,
      workAreas: [primary, secondary],
    }),
    saved,
  );
});

test("不可见保存位置被限制到最近的可见工作区", () => {
  assert.deepEqual(
    resolveBarPosition({
      saved: { x: 4000, y: 3000 },
      primaryWorkArea: primary,
      workAreas: [primary, secondary],
    }),
    {
      x: primary.width - BAR_SIZE.width,
      y: primary.height - BAR_SIZE.height,
    },
  );
  assert.deepEqual(
    resolveBarPosition({
      saved: { x: -5000, y: -3000 },
      primaryWorkArea: primary,
      workAreas: [primary, secondary],
    }),
    { x: secondary.x, y: secondary.y },
  );
});

test("损坏的保存位置按首次启动处理", () => {
  assert.deepEqual(
    resolveBarPosition({
      saved: { x: Number.NaN, y: 20 },
      primaryWorkArea: primary,
      workAreas: [primary],
    }),
    {
      x: primary.x + primary.width - BAR_SIZE.width - 24,
      y: primary.y + primary.height - BAR_SIZE.height - 32,
    },
  );
});

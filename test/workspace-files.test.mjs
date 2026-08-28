import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

import { resolveInsideWorkspace } from "../dist-electron/electron/workspace-files.js";

test("工作区资源路径只能位于项目的 .dockyard 目录内", () => {
  const root = resolve("test-fixtures", ".dockyard");
  assert.equal(
    resolveInsideWorkspace(root, "assets/source/example.png"),
    resolve(root, "assets/source/example.png"),
  );
});

test("拒绝绝对路径和越过工作区边界的相对路径", () => {
  const root = resolve("test-fixtures", ".dockyard");
  assert.throws(
    () => resolveInsideWorkspace(root, resolve("outside.png")),
    /必须是相对路径/,
  );
  assert.throws(
    () => resolveInsideWorkspace(root, "../outside.png"),
    /路径越界/,
  );
});

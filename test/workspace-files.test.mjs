import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

import {
  resolveInsideWorkspace,
  validateWorkspaceDocuments,
} from "../dist-electron/electron/workspace-files.js";

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

test("工作区身份文件必须与设计文件一致", () => {
  const design = { version: 2, id: "workspace-a" };
  const metadata = { version: 1, id: "workspace-a" };
  assert.equal(
    validateWorkspaceDocuments(design, metadata, "workspace-a"),
    "workspace-a",
  );
  assert.throws(
    () => validateWorkspaceDocuments(design, { ...metadata, id: "workspace-b" }),
    /工作区标识不一致/,
  );
  assert.throws(
    () => validateWorkspaceDocuments(design, metadata, "workspace-b"),
    /不是原来的项目工作区/,
  );
});

test("拒绝缺少版本或工作区标识的设计文件", () => {
  assert.throws(
    () => validateWorkspaceDocuments({ version: 2 }),
    /不是有效的 Dockyard 工作区文件/,
  );
  assert.throws(
    () => validateWorkspaceDocuments({ version: 1, id: "workspace-a" }),
    /不是有效的 Dockyard 工作区文件/,
  );
});

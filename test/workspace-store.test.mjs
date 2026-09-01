import test from "node:test";
import assert from "node:assert/strict";

import { createWorkspaceStore } from "../src/workspace/store.ts";

function workspace(overrides = {}) {
  return {
    version: 3,
    id: "workspace-1",
    name: "测试工作区",
    updatedAt: "2026-01-01T00:00:00.000Z",
    currentArtworkId: "art-1",
    bases: [],
    artworks: [
      {
        id: "art-1",
        name: "草稿",
        status: "draft",
        updatedAt: "2026-01-01T00:00:00.000Z",
        source: null,
        scene: { type: "excalidraw", version: 2, source: "", elements: [] },
        annotations: [],
        components: [],
        notes: "",
      },
    ],
    libraryItems: [],
    globalComponents: [],
    recentProjects: [],
    preferredLibraries: [],
    windowState: {},
    ...overrides,
  };
}

function createPorts(saved) {
  const calls = [];
  return {
    calls,
    load: async () => saved,
    save: async (next) => {
      calls.push(["save", next]);
      return { ok: true };
    },
    sync: (next) => calls.push(["sync", next]),
  };
}

test("工作区加载完成前拒绝写入", async () => {
  const ports = createPorts(workspace());
  const store = createWorkspaceStore(ports);

  const result = await store.dispatch({
    type: "update-artwork",
    artworkId: "art-1",
    patch: { notes: "不应写入" },
  });

  assert.deepEqual(result, { ok: false, error: "工作区尚未加载完成" });
  assert.equal(ports.calls.length, 0);
});

test("草稿更新保存一次并通知订阅者", async () => {
  const ports = createPorts(workspace());
  const store = createWorkspaceStore(ports);
  let notifications = 0;
  store.subscribe(() => notifications++);
  await store.load();

  const result = await store.dispatch({
    type: "update-artwork",
    artworkId: "art-1",
    patch: { notes: "已编辑" },
  });

  assert.equal(result.ok, true);
  assert.equal(store.getSnapshot().workspace.artworks[0].notes, "已编辑");
  assert.equal(notifications, 2);
  assert.equal(ports.calls.filter(([kind]) => kind === "save").length, 1);
});

test("完成稿不可编辑但可以删除", async () => {
  const saved = workspace({
    artworks: [{
      ...workspace().artworks[0],
      status: "completed",
      completedAt: "2026-01-02T00:00:00.000Z",
    }],
  });
  const ports = createPorts(saved);
  const store = createWorkspaceStore(ports);
  await store.load();

  const update = await store.dispatch({
    type: "update-artwork",
    artworkId: "art-1",
    patch: { notes: "不应修改" },
  });
  const remove = await store.dispatch({ type: "delete-artwork", artworkId: "art-1" });

  assert.deepEqual(update, { ok: false, error: "已完成稿件为只读" });
  assert.equal(remove.ok, true);
  assert.equal(store.getSnapshot().workspace.artworks.length, 0);
});

test("完成命令把草稿变为只读稿件并保存完成记录", async () => {
  const ports = createPorts(workspace());
  const store = createWorkspaceStore(ports);
  await store.load();

  const result = await store.dispatch({
    type: "complete-artwork",
    artworkId: "art-1",
    completedAt: "2026-01-02T00:00:00.000Z",
    previewDataUrl: "data:image/png;base64,preview",
    componentsText: "[1] Avatar",
  });

  const item = store.getSnapshot().workspace.artworks[0];
  assert.deepEqual(result, { ok: true });
  assert.equal(item.status, "completed");
  assert.equal(item.completedPreviewDataUrl, "data:image/png;base64,preview");
  assert.equal(item.completedComponentsText, "[1] Avatar");
});

test("旧版本命令被拒绝，避免覆盖新窗口数据", async () => {
  const ports = createPorts(workspace());
  const store = createWorkspaceStore(ports);
  await store.load();
  await store.dispatch({ type: "update-artwork", artworkId: "art-1", patch: { notes: "新版本" } });

  const result = await store.dispatch({
    type: "update-artwork",
    artworkId: "art-1",
    patch: { notes: "旧版本" },
    expectedRevision: 0,
  });

  assert.deepEqual(result, { ok: false, error: "工作区版本已更新，请重新读取" });
  assert.equal(store.getSnapshot().workspace.artworks[0].notes, "新版本");
});

test("保存失败时不改变内存快照", async () => {
  const ports = createPorts(workspace());
  ports.save = async () => ({ ok: false, error: "磁盘不可写" });
  const store = createWorkspaceStore(ports);
  await store.load();

  const result = await store.dispatch({
    type: "update-artwork",
    artworkId: "art-1",
    patch: { notes: "不应留下" },
  });

  assert.deepEqual(result, { ok: false, error: "磁盘不可写" });
  assert.equal(store.getSnapshot().workspace.artworks[0].notes, "");
});

test("外部旧工作区不会覆盖当前快照", async () => {
  const ports = createPorts(workspace());
  const store = createWorkspaceStore(ports);
  await store.load();
  await store.dispatch({ type: "update-artwork", artworkId: "art-1", patch: { notes: "新版本" } });
  store.receiveExternal({ ...store.getSnapshot().workspace, updatedAt: "2025-01-01T00:00:00.000Z", artworks: [{ ...store.getSnapshot().workspace.artworks[0], notes: "旧版本" }] });

  assert.equal(store.getSnapshot().workspace.artworks[0].notes, "新版本");
});

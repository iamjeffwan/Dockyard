import type { Artwork, Workspace } from "../types.js";

export type WorkspaceSnapshot = {
  workspace: Workspace;
  ready: boolean;
  revision: number;
};

export type WorkspaceCommand =
  | {
      type: "update-workspace";
      update: (workspace: Workspace) => Workspace;
      persist?: boolean;
      expectedRevision?: number;
    }
  | {
      type: "update-artwork";
      artworkId: string;
      patch: Partial<Artwork>;
      expectedRevision?: number;
    }
  | {
      type: "delete-artwork";
      artworkId: string;
      expectedRevision?: number;
    }
  | {
      type: "complete-artwork";
      artworkId: string;
      completedAt: string;
      previewDataUrl: string;
      componentsText: string;
      record?: Artwork["record"];
      expectedRevision?: number;
    };

export type WorkspaceCommandResult =
  | { ok: true }
  | { ok: false; error: string };

export type WorkspacePorts = {
  load: () => Promise<Workspace | null>;
  save: (workspace: Workspace) => Promise<{ ok: boolean; path?: string; error?: string }>;
  sync?: (workspace: Workspace) => void;
};

export type WorkspaceStore = {
  getSnapshot: () => WorkspaceSnapshot;
  subscribe: (listener: () => void) => () => void;
  load: () => Promise<WorkspaceSnapshot>;
  dispatch: (command: WorkspaceCommand) => Promise<WorkspaceCommandResult>;
  save: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  receiveExternal: (workspace: Workspace) => void;
};

export function createWorkspaceStore(
  ports: WorkspacePorts,
  initialWorkspace?: Workspace,
): WorkspaceStore {
  let snapshot: WorkspaceSnapshot = {
    workspace: initialWorkspace || emptyWorkspace(),
    ready: false,
    revision: 0,
  };
  const listeners = new Set<() => void>();
  let mutations: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mutations.then(operation);
    mutations = result.catch(() => undefined);
    return result;
  };

  const notify = () => listeners.forEach((listener) => listener());
  const publish = async (
    workspace: Workspace,
    persist: boolean,
  ): Promise<{ ok: true } | { ok: false; error?: string }> => {
    if (persist) {
      const saved = await ports.save(workspace);
      if (!saved.ok) return saved;
    }
    snapshot = {
      workspace,
      ready: true,
      revision: snapshot.revision + 1,
    };
    ports.sync?.(workspace);
    notify();
    return { ok: true };
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load() {
      const loaded = await ports.load();
      if (loaded) {
        snapshot = { workspace: loaded, ready: true, revision: snapshot.revision + 1 };
      } else {
        snapshot = { ...snapshot, ready: true };
      }
      notify();
      return snapshot;
    },
    dispatch(command) {
      return enqueue(async () => {
        if (!snapshot.ready) return { ok: false, error: "工作区尚未加载完成" };
        if (
          command.expectedRevision !== undefined &&
          command.expectedRevision !== snapshot.revision
        ) {
          return { ok: false, error: "工作区版本已更新，请重新读取" };
        }

        const current = snapshot.workspace;
        if (command.type === "update-workspace") {
          const next = command.update(current);
          const currentCompleted = new Map(
            current.artworks
              .filter((item) => item.status === "completed")
              .map((item) => [item.id, JSON.stringify(item)]),
          );
          const currentDraftIds = new Set(
            current.artworks.filter((item) => item.status !== "completed").map((item) => item.id),
          );
          for (const item of next.artworks) {
            if (item.status === "completed" && currentCompleted.get(item.id) !== JSON.stringify(item)) {
              return {
                ok: false,
                error: currentDraftIds.has(item.id)
                  ? "请通过完成命令生成完成记录"
                  : "已完成稿件为只读，请通过完成或删除命令修改",
              };
            }
          }
          const saved = await publish(next, command.persist !== false);
          if (!saved.ok) return { ok: false, error: saved.error || "工作区保存失败" };
          return { ok: true };
        }

        const target = current.artworks.find((item) => item.id === command.artworkId);
        if (!target) return { ok: false, error: "当前稿件不存在" };

        let next: Workspace;
        if (command.type === "update-artwork") {
          if (target.status === "completed") return { ok: false, error: "已完成稿件为只读" };
          next = {
            ...current,
            artworks: current.artworks.map((item) =>
              item.id === command.artworkId
                ? { ...item, ...command.patch, updatedAt: command.patch.updatedAt || new Date().toISOString() }
                : item,
            ),
            updatedAt: new Date().toISOString(),
          };
        } else if (command.type === "delete-artwork") {
          next = {
            ...current,
            currentArtworkId:
              current.currentArtworkId === command.artworkId ? null : current.currentArtworkId,
            artworks: current.artworks.filter((item) => item.id !== command.artworkId),
            updatedAt: new Date().toISOString(),
          };
        } else {
          if (target.status === "completed") return { ok: false, error: "该稿件已经完成" };
          next = {
            ...current,
            currentArtworkId: null,
            artworks: current.artworks.map((item) =>
              item.id === command.artworkId
                ? {
                    ...item,
                    status: "completed",
                    completedAt: command.completedAt,
                    completedPreviewDataUrl: command.previewDataUrl,
                    completedComponentsText: command.componentsText,
                    record: command.record,
                    updatedAt: command.completedAt,
                  }
                : item,
            ),
            updatedAt: command.completedAt,
          };
        }

        const saved = await publish(next, true);
        if (!saved.ok) return { ok: false, error: saved.error || "工作区保存失败" };
        return { ok: true };
      });
    },
    save: () => enqueue(() => snapshot.ready ? ports.save(snapshot.workspace) : Promise.resolve({ ok: false, error: "工作区尚未加载完成" })),
    receiveExternal(workspace) {
      if (workspace.updatedAt < snapshot.workspace.updatedAt) return;
      snapshot = { workspace, ready: true, revision: snapshot.revision + 1 };
      notify();
    },
  };
}

function emptyWorkspace(): Workspace {
  return {
    version: 3,
    id: "workspace-empty",
    name: "未命名设计",
    updatedAt: new Date().toISOString(),
    currentArtworkId: null,
    bases: [],
    artworks: [],
    libraryItems: [],
    globalComponents: [],
    recentProjects: [],
    preferredLibraries: [],
    windowState: {},
  };
}

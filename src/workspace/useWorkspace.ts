import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { Workspace } from "../types.js";
import { createWorkspaceStore } from "./store.js";

const emptyWorkspace = (): Workspace => ({
  version: 3,
  id: `workspace-${Math.random().toString(36).slice(2, 9)}`,
  name: "未命名设计",
  updatedAt: new Date().toISOString(),
  currentArtworkId: null,
  artworks: [],
  bases: [],
  libraryItems: [],
  globalComponents: [],
  recentProjects: [],
  preferredLibraries: ["shadcn/ui"],
  windowState: {},
});

const store = createWorkspaceStore({
  load: () => window.dockyard?.loadWorkspace() || Promise.resolve(null),
  save: (workspace) =>
    window.dockyard?.saveWorkspace({ ...workspace, updatedAt: new Date().toISOString() }) ||
    Promise.resolve({ ok: false, error: "工作区保存接口不可用" }),
  sync: (workspace) => window.dockyard?.syncDesign(workspace),
}, emptyWorkspace());

let loadPromise: Promise<unknown> | null = null;
let externalSubscribed = false;
const ensureLoaded = () => {
  if (!loadPromise) loadPromise = store.load();
  return loadPromise;
};

export function useWorkspace() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const historyRef = useRef<Workspace[]>([]);
  const futureRef = useRef<Workspace[]>([]);

  useEffect(() => {
    void ensureLoaded();
    if (!externalSubscribed) {
      externalSubscribed = true;
      window.dockyard?.onDesignState((next) => store.receiveExternal(next));
    }
  }, []);

  const update = useCallback(
    (producer: (current: Workspace) => Workspace, record = true) => {
      const current = store.getSnapshot();
      if (!current.ready) return Promise.resolve({ ok: false, error: "工作区尚未加载完成" });
      return store.dispatch({
        type: "update-workspace",
        update: (latest) => {
          if (record) {
            historyRef.current = [...historyRef.current.slice(-39), latest];
            futureRef.current = [];
          }
          return producer(latest);
        },
        persist: record,
      });
    },
    [],
  );

  const undo = useCallback(() => {
    const previous = historyRef.current.at(-1);
    if (!previous) return;
    const current = store.getSnapshot();
    historyRef.current = historyRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, current.workspace];
    void store.dispatch({ type: "update-workspace", update: () => previous });
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current.at(-1);
    if (!next) return;
    const current = store.getSnapshot();
    futureRef.current = futureRef.current.slice(0, -1);
    historyRef.current = [...historyRef.current, current.workspace];
    void store.dispatch({ type: "update-workspace", update: () => next });
  }, []);

  return {
    workspace: snapshot.workspace,
    update,
    save: () => store.save(),
    dispatch: store.dispatch,
    undo,
    redo,
    canUndo: historyRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}

export { store as workspaceStore };

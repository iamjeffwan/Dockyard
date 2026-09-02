import electron from "electron";

const { contextBridge, ipcRenderer } = electron;

contextBridge.exposeInMainWorld("dockyard", {
  saveWorkspace: (workspace: unknown) =>
    ipcRenderer.invoke("workspace:save", workspace),
  loadWorkspace: () => ipcRenderer.invoke("workspace:load"),
  runStorybookSearch: (payload: unknown) =>
    ipcRenderer.invoke("codex:storybook-search", payload),
  recognizeSketch: (payload: { imageDataUrl: string; prompt: string }) =>
    ipcRenderer.invoke("model:recognize", payload),
  onCodexTrace: (listener: (trace: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, trace: unknown) =>
      listener(trace);
    ipcRenderer.on("codex:trace", handler);
    return () => ipcRenderer.removeListener("codex:trace", handler);
  },
  openAppLogs: () => ipcRenderer.invoke("diagnostics:logs-open"),
  writeLog: (level: "debug" | "info" | "warn" | "error", event: string, context?: Record<string, unknown>) =>
    ipcRenderer.send("diagnostics:log", { level, event, context }),
  completeArtwork: (payload: unknown) =>
    ipcRenderer.invoke("artwork:complete", payload),
  pickProject: () => ipcRenderer.invoke("project:pick"),
  projectStatus: () => ipcRenderer.invoke("project:status"),
  openProject: (path: string) => ipcRenderer.invoke("project:open", path),
  relinkProject: (previousPath: string, path: string) =>
    ipcRenderer.invoke("project:relink", previousPath, path),
  createProjectWorkspace: (path: string) =>
    ipcRenderer.invoke("project:create-workspace", path),
  syncDesign: (workspace: unknown) =>
    ipcRenderer.send("design:sync", workspace),
  storybookSources: () => ipcRenderer.invoke("storybook:sources"),
  storybookCatalog: (sourceId: string) =>
    ipcRenderer.invoke("storybook:catalog", sourceId),
  storybookCheck: (sourceId: string) =>
    ipcRenderer.invoke("storybook:check", sourceId),
  storybookMeasureFrame: (storyUrl: string) =>
    ipcRenderer.invoke("storybook:measure-frame", storyUrl),
  captureViewport: () => ipcRenderer.invoke("artwork:capture-viewport"),
  openPanel: (
    view: "annotator" | "component-search" | "tokens" | "decisions" | "model-ab-test",
  ) => ipcRenderer.invoke("panel:open", view),
  closePanel: (
    view: "annotator" | "component-search" | "tokens" | "decisions" | "model-ab-test",
  ) => ipcRenderer.invoke("panel:close", view),
  showBar: () => ipcRenderer.invoke("bar:show"),
  hideBar: () => ipcRenderer.invoke("bar:hide"),
  onDesignState: (listener: (workspace: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, workspace: unknown) =>
      listener(workspace);
    ipcRenderer.on("design:state", handler);
    return () => ipcRenderer.removeListener("design:state", handler);
  },
});

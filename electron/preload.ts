import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("dockyard", {
  saveWorkspace: (workspace: unknown) =>
    ipcRenderer.invoke("workspace:save", workspace),
  loadWorkspace: () => ipcRenderer.invoke("workspace:load"),
  runCodexSearch: (payload: unknown) =>
    ipcRenderer.invoke("codex:search", payload),
  onCodexTrace: (listener: (trace: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, trace: unknown) =>
      listener(trace);
    ipcRenderer.on("codex:trace", handler);
    return () => ipcRenderer.removeListener("codex:trace", handler);
  },
  openCodexLogs: () => ipcRenderer.invoke("codex:logs-open"),
  componentCacheStatus: () => ipcRenderer.invoke("component-cache:status"),
  clearComponentCache: () => ipcRenderer.invoke("component-cache:clear"),
  generateContext: (payload: unknown) =>
    ipcRenderer.invoke("context:generate", payload),
  pickProject: () => ipcRenderer.invoke("project:pick"),
  openContext: (path: string) => ipcRenderer.invoke("context:open", path),
  syncDesign: (workspace: unknown) =>
    ipcRenderer.send("design:sync", workspace),
  mcpPort: () => ipcRenderer.invoke("mcp:port"),
  storybookSources: () => ipcRenderer.invoke("storybook:sources"),
  storybookCatalog: (sourceId: string) =>
    ipcRenderer.invoke("storybook:catalog", sourceId),
  storybookCheck: (sourceId: string) =>
    ipcRenderer.invoke("storybook:check", sourceId),
  storybookMeasureFrame: (storyUrl: string) =>
    ipcRenderer.invoke("storybook:measure-frame", storyUrl),
  captureViewport: () => ipcRenderer.invoke("artwork:capture-viewport"),
  openPanel: (
    view: "annotator" | "component-search" | "tokens" | "decisions",
  ) => ipcRenderer.invoke("panel:open", view),
  closePanel: (
    view: "annotator" | "component-search" | "tokens" | "decisions",
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

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dockyard', {
  saveWorkspace: (workspace: unknown) => ipcRenderer.invoke('workspace:save', workspace),
  loadWorkspace: () => ipcRenderer.invoke('workspace:load'),
  runCodexSearch: (payload: unknown) => ipcRenderer.invoke('codex:search', payload),
  generateContext: (payload: unknown) => ipcRenderer.invoke('context:generate', payload),
  pickProject: () => ipcRenderer.invoke('project:pick'),
  openContext: (path: string) => ipcRenderer.invoke('context:open', path),
  syncDesign: (workspace: unknown) => ipcRenderer.send('design:sync', workspace),
  mcpPort: () => ipcRenderer.invoke('mcp:port'),
  openPanel: (view: 'annotator' | 'component-search') => ipcRenderer.invoke('panel:open', view),
  closePanel: (view: 'annotator' | 'component-search') => ipcRenderer.invoke('panel:close', view),
  showBar: () => ipcRenderer.invoke('bar:show'),
  hideBar: () => ipcRenderer.invoke('bar:hide'),
  onDesignState: (listener: (workspace: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, workspace: unknown) => listener(workspace);
    ipcRenderer.on('design:state', handler);
    return () => ipcRenderer.removeListener('design:state', handler);
  },
});

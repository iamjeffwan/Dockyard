const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("prototypeElectron", {
  loadStoryIndex: () => ipcRenderer.invoke("prototype:load-story-index"),
  measureRemoteStory: (storyUrl) =>
    ipcRenderer.invoke("prototype:measure-story-frame", storyUrl),
});

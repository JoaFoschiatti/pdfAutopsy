const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mdAutopsy", {
  openMarkdownDialog: () => ipcRenderer.invoke("dialog:open-markdown"),
  writeClipboardText: (text) => ipcRenderer.invoke("clipboard:write-text", text),
  setNativeFullscreen: (fullscreen) => ipcRenderer.invoke("window:set-fullscreen", Boolean(fullscreen)),
  getNativeFullscreen: () => ipcRenderer.invoke("window:get-fullscreen"),
  onNativeFullscreenChange: (callback) => {
    const listener = (_event, fullscreen) => callback(Boolean(fullscreen));
    ipcRenderer.on("window:fullscreen-changed", listener);
    return () => ipcRenderer.removeListener("window:fullscreen-changed", listener);
  },
  onOpenMarkdownFromMenu: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("menu:open-markdown", listener);
    return () => ipcRenderer.removeListener("menu:open-markdown", listener);
  },
});

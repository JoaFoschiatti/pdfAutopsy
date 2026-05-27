const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("estudioPdf", {
  openPdfDialog: () => ipcRenderer.invoke("dialog:open-pdf"),
  writeClipboardText: (text) => ipcRenderer.invoke("clipboard:write-text", text),
  setNativeFullscreen: (fullscreen) => ipcRenderer.invoke("window:set-fullscreen", Boolean(fullscreen)),
  getNativeFullscreen: () => ipcRenderer.invoke("window:get-fullscreen"),
  onNativeFullscreenChange: (callback) => {
    const listener = (_event, fullscreen) => callback(Boolean(fullscreen));
    ipcRenderer.on("window:fullscreen-changed", listener);
    return () => ipcRenderer.removeListener("window:fullscreen-changed", listener);
  },
  onOpenPdfFromMenu: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("menu:open-pdf", listener);
    return () => ipcRenderer.removeListener("menu:open-pdf", listener);
  },
});

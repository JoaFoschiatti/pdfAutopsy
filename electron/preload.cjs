const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("estudioPdf", {
  openPdfDialog: () => ipcRenderer.invoke("dialog:open-pdf"),
  writeClipboardText: (text) => ipcRenderer.invoke("clipboard:write-text", text),
  onOpenPdfFromMenu: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("menu:open-pdf", listener);
    return () => ipcRenderer.removeListener("menu:open-pdf", listener);
  },
});

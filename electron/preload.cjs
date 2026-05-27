const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("estudioPdf", {
  openPdfDialog: () => ipcRenderer.invoke("dialog:open-pdf"),
  onOpenPdfFromMenu: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("menu:open-pdf", listener);
    return () => ipcRenderer.removeListener("menu:open-pdf", listener);
  },
});

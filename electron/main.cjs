const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("node:fs/promises");
const path = require("node:path");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow = null;
let hasScheduledUpdateCheck = false;

app.setAppUserModelId("com.pdfautopsy.app");

function scheduleAutoUpdateCheck() {
  if (isDev || process.env.ELECTRON_SMOKE_TEST === "1" || hasScheduledUpdateCheck) return;
  hasScheduledUpdateCheck = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    console.warn("Auto-update check failed:", error?.message ?? error);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Reiniciar e instalar", "Luego"],
      defaultId: 0,
      cancelId: 1,
      title: "Actualizacion lista",
      message: `pdfAutopsy ${info.version} ya esta descargado.`,
      detail: "Reinicia la app para instalar la actualizacion ahora o se instalara al cerrar.",
    });

    if (result.response === 0) autoUpdater.quitAndInstall();
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.warn("Auto-update check failed:", error?.message ?? error);
    });
  }, 5000);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: "pdfAutopsy",
    width: 1365,
    height: 768,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f4f6f7",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  function sendFullscreenState() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("window:fullscreen-changed", mainWindow.isFullScreen());
  }

  mainWindow.on("enter-full-screen", sendFullscreenState);
  mainWindow.on("leave-full-screen", sendFullscreenState);

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === "o") {
      event.preventDefault();
      mainWindow?.webContents.send("menu:open-pdf");
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
    scheduleAutoUpdateCheck();
  });

  if (process.env.ELECTRON_SMOKE_TEST === "1") {
    mainWindow.webContents.once("did-fail-load", (_event, code, description) => {
      console.error(JSON.stringify({ ok: false, code, description }));
      app.exit(1);
    });

    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(async () => {
        const state = await mainWindow.webContents.executeJavaScript(`({
          title: document.title,
          hasAppShell: Boolean(document.querySelector('.app-shell')),
          hasDocument: Boolean(document.querySelector('.react-pdf__Page') || document.querySelector('.empty-document')),
          hasStudyPanel: Boolean(document.querySelector('.study-panel')),
          url: location.href
        })`);
        console.log(JSON.stringify({ ok: true, state }));
        app.exit(0);
      }, 1800);
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

ipcMain.handle("dialog:open-pdf", async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Abrir PDF",
    properties: ["openFile"],
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const [data, stats] = await Promise.all([fs.readFile(filePath), fs.stat(filePath)]);
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

  return {
    name: path.basename(filePath),
    size: stats.size,
    lastModified: stats.mtimeMs,
    data: arrayBuffer,
  };
});

ipcMain.handle("clipboard:write-text", (_event, text) => {
  clipboard.writeText(String(text ?? ""));
  return true;
});

ipcMain.handle("window:set-fullscreen", (event, fullscreen) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) return false;

  window.setFullScreen(Boolean(fullscreen));
  return window.isFullScreen();
});

ipcMain.handle("window:get-fullscreen", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) return false;
  return window.isFullScreen();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

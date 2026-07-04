// Preload: minimal, validated bridge. Runs sandboxed with contextIsolation (C6).
// Every function type-checks its arguments before crossing the IPC boundary;
// main process re-validates everything independently.
const { contextBridge, ipcRenderer } = require("electron");

const VALID_WINDOW_ACTIONS = new Set(["minimize", "maximize", "close"]);

contextBridge.exposeInMainWorld("aguacate", {
  platform: process.platform, // 'darwin' | 'win32' | 'linux'

  getBackend: () => ipcRenderer.invoke("aguacate:get-backend"),

  openExternal: (url) => {
    if (typeof url !== "string") return Promise.resolve({ ok: false });
    return ipcRenderer.invoke("aguacate:open-external", url);
  },

  showInFolder: (filePath) => {
    if (typeof filePath !== "string") return Promise.resolve({ ok: false });
    return ipcRenderer.invoke("aguacate:show-in-folder", filePath);
  },

  exportPdf: (filename) => {
    if (typeof filename !== "string") return Promise.resolve({ ok: false });
    return ipcRenderer.invoke("aguacate:export-pdf", filename);
  },

  windowControl: (action) => {
    if (!VALID_WINDOW_ACTIONS.has(action)) return Promise.resolve({ ok: false });
    return ipcRenderer.invoke("aguacate:window-control", action);
  },

  notify: (title, body) => {
    if (typeof title !== "string" || typeof body !== "string") {
      return Promise.resolve({ ok: false });
    }
    return ipcRenderer.invoke("aguacate:notify", title, body);
  },

  setRecordingState: (recording) => {
    if (typeof recording !== "boolean") return Promise.resolve({ ok: false });
    return ipcRenderer.invoke("aguacate:recording-state", recording);
  },

  getAutoLaunch: () => ipcRenderer.invoke("aguacate:get-auto-launch"),
  setAutoLaunch: (enabled) => {
    if (typeof enabled !== "boolean") return Promise.resolve({ ok: false });
    return ipcRenderer.invoke("aguacate:set-auto-launch", enabled);
  },

  onShortcut: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, name) => {
      if (typeof name === "string") callback(name);
    };
    ipcRenderer.on("aguacate:shortcut", handler);
    return () => ipcRenderer.removeListener("aguacate:shortcut", handler);
  },

  onDeepLink: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, url) => callback(url);
    ipcRenderer.on("aguacate:deep-link", handler);
    return () => ipcRenderer.removeListener("aguacate:deep-link", handler);
  },
});

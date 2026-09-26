// Isolated Chromium preview. Does not load Jotva's main process or backend.
const { app, BrowserWindow } = require("electron");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
app.setPath("userData", mkdtempSync(join(tmpdir(), "jotva-design-preview-")));
app.name = "Jotva Design Preview";
app.whenReady().then(() => {
  const window = new BrowserWindow({ width: 1700, height: 1180, title: "Jotva Design Preview", webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.loadURL("http://127.0.0.1:5198/tests/visual/index.html");
});
app.on("window-all-closed", () => app.quit());

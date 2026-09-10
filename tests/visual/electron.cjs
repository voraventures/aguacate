// Isolated Chromium preview. Does not load Aguacate's main process or backend.
const { app, BrowserWindow } = require("electron");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
app.setPath("userData", mkdtempSync(join(tmpdir(), "aguacate-design-preview-")));
app.name = "Aguacate Design Preview";
app.whenReady().then(() => {
  const window = new BrowserWindow({ width: 1700, height: 1180, title: "Aguacate Design Preview", webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.loadURL("http://127.0.0.1:5198/tests/visual/index.html");
});
app.on("window-all-closed", () => app.quit());

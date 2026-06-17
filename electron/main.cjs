// Aguacate Electron main process (macOS + Windows).
// Spawns the Python backend, reads the {port, token} handshake from stdout,
// and exposes it to the renderer over IPC only (C2). Hardened window (C6).
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  protocol,
  dialog,
  Tray,
  Menu,
  Notification,
  globalShortcut,
  nativeImage,
  net,
  session,
} = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const IS_DEV = !app.isPackaged;
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const IS_WIN = process.platform === "win32";
const PROJECT_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(app.getPath("appData"), "Aguacate");

let mainWindow = null;
let tray = null;
let backendProc = null;
let backendInfo = null; // { port, token }
let isQuitting = false;
const pendingBackendWaiters = [];

// ---------- single instance (also delivers win32 protocol deep links) ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
app.on("second-instance", (_event, argv) => {
  showWindow();
  // On Windows the aguacate:// URL arrives in the second instance's argv.
  const link = argv.find((a) => typeof a === "string" && a.startsWith("aguacate://"));
  if (link && mainWindow) {
    mainWindow.webContents.send("aguacate:deep-link", link.slice(0, 2048));
  }
});

// ---------- backend lifecycle ----------
function resolveBackend() {
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, "backend", "dist", "aguacate-backend", "aguacate-backend");
    if (fs.existsSync(bundled)) return { exe: bundled, useExe: true };
  }
  // Dev fallback: use .venv python
  const venvPython = IS_WIN
    ? path.join(PROJECT_ROOT, "backend", ".venv", "Scripts", "python.exe")
    : path.join(PROJECT_ROOT, "backend", ".venv", "bin", "python");
  return { exe: venvPython, useExe: false };
}

function startBackend() {
  const { exe, useExe } = resolveBackend();
  backendProc = spawn(exe, useExe ? [] : ["run.py"], {
    // Bundled exe is self-contained; its own dir always exists on disk. In dev
    // the interpreter needs the backend/ source dir so run.py resolves imports.
    cwd: useExe ? path.dirname(exe) : path.join(PROJECT_ROOT, "backend"),
    // DEV ONLY: signal dev mode to the backend so it can register
    // developer-testing endpoints (never set true in packaged builds).
    env: { ...process.env, PYTHONUNBUFFERED: "1", AGUACATE_DEV: IS_DEV ? "1" : "0" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let buffer = "";
  backendProc.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.event === "ready" && msg.port && msg.token) {
          backendInfo = { port: msg.port, token: msg.token };
          pendingBackendWaiters.splice(0).forEach((resolve) => resolve(backendInfo));
        }
      } catch {
        /* non-JSON stdout noise; ignore */
      }
    }
  });
  backendProc.stderr.on("data", (chunk) => {
    if (IS_DEV) process.stderr.write(`[backend] ${chunk}`);
  });
  backendProc.on("error", (err) => {
    backendProc = null;
    if (!isQuitting) {
      dialog.showErrorBox(
        "Aguacate backend failed to start",
        `The local engine could not be launched (${err.code || err.message}).`
      );
    }
  });
  backendProc.on("exit", (code) => {
    backendProc = null;
    if (code !== 0 && code !== null && mainWindow && !isQuitting) {
      dialog.showErrorBox(
        "Aguacate backend stopped",
        "The local engine exited unexpectedly. Restart the app to continue."
      );
    }
  });
}

function getBackendInfo() {
  if (backendInfo) return Promise.resolve(backendInfo);
  return new Promise((resolve) => pendingBackendWaiters.push(resolve));
}

// ---------- window ----------
function createWindow() {
  const platformChrome = IS_WIN
    ? { frame: false } // custom titlebar component, controls top-right
    : { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 16 } };

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "Aguacate",
    icon: path.join(__dirname, "assets", process.platform === "win32" ? "icon.ico" : "icon.png"),
    backgroundColor: "#fbfaf6",
    ...platformChrome,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true, // C6
      nodeIntegration: false, // C6
      sandbox: true, // C6
      webSecurity: true,
      spellcheck: false,
    },
  });

  // Block any navigation away from the app and any window.open (C6).
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = IS_DEV ? url.startsWith("http://localhost:5173") : url.startsWith("app://");
    if (!allowed) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  if (IS_DEV) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadURL("app://aguacate/index.html");
  }

  // Closing hides to tray; Quit (tray/menu/Cmd+Q) really exits.
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// Serve the built renderer over app:// in production so the backend CORS
// allowlist never needs file:// (C3). Electron ≥36 API: protocol.handle.
function registerAppProtocol() {
  const base = app.isPackaged
    ? path.join(app.getAppPath(), "dist")
    : path.join(PROJECT_ROOT, "dist");
  protocol.handle("app", (request) => {
    try {
      const url = new URL(request.url);
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
      const target = path.normalize(path.join(base, rel));
      if (target !== base && !target.startsWith(base + path.sep)) {
        return new Response("Forbidden", { status: 403 }); // traversal attempt
      }
      return net.fetch(pathToFileURL(target).toString());
    } catch {
      return new Response("Bad request", { status: 400 });
    }
  });
}

// Apply the Content-Security-Policy via response headers. NOTE: index.html also
// ships a <meta> CSP; browsers enforce the intersection of header + meta, so the
// effective policy stays as restrictive as the stricter of the two.
function applyContentSecurityPolicy() {
  const csp =
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' app:; " +
    "style-src 'self' 'unsafe-inline' app:; " +
    "connect-src 'self' app: http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:* https://api.anthropic.com";
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}

// ---------- tray ----------
function buildTrayIcon() {
  // 16x16 avocado-green rounded dot, generated in-process (no asset pipeline).
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const cx = 7.5;
  const cy = 7.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const alpha = d <= 5.6 ? 255 : d <= 6.8 ? Math.round(255 * (6.8 - d) / 1.2) : 0;
      const i = (y * size + x) * 4; // BGRA
      buf[i] = 69; // B
      buf[i + 1] = 139; // G
      buf[i + 2] = 63; // R
      buf[i + 3] = alpha;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function createTray() {
  tray = new Tray(buildTrayIcon());
  tray.setToolTip("Aguacate — AI meeting notes");
  const menu = Menu.buildFromTemplate([
    { label: "Show Aguacate", click: () => showWindow() },
    { label: "Hide", click: () => mainWindow?.hide() },
    { type: "separator" },
    {
      label: "Start / stop recording",
      accelerator: "CommandOrControl+Shift+R",
      click: () => sendShortcut("toggle-record"),
    },
    { type: "separator" },
    {
      label: "Quit Aguacate",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (IS_WIN) showWindow(); // win: left-click opens; mac: click shows menu
  });
}

// ---------- global shortcut ----------
function sendShortcut(name) {
  if (mainWindow) {
    mainWindow.webContents.send("aguacate:shortcut", name);
  }
}

// ---------- ambient mode (Cmd+Shift+A): menubar-only recording presence ----------
let ambient = false;
function toggleAmbient() {
  ambient = !ambient;
  if (ambient) {
    mainWindow?.hide();
    if (process.platform === "darwin") app.dock?.hide();
    sendShortcut("ambient-start"); // renderer starts recording if idle
    tray?.setToolTip("Aguacate — recording (ambient)");
  } else {
    if (process.platform === "darwin") app.dock?.show();
    showWindow();
    tray?.setToolTip("Aguacate — AI meeting notes");
  }
}

// Tray pulse while recording: alternate between accent dot and dim dot.
let pulseTimer = null;
let pulsePhase = false;
const ICON_IDLE = () => buildTrayIcon();
function buildRecordingIcon(dim) {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const alphaScale = dim ? 0.45 : 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2);
      const alpha = d <= 5.6 ? 255 : d <= 6.8 ? Math.round(255 * (6.8 - d) / 1.2) : 0;
      const i = (y * size + x) * 4; // BGRA — red recording dot
      buf[i] = 64;
      buf[i + 1] = 74;
      buf[i + 2] = 208;
      buf[i + 3] = Math.round(alpha * alphaScale);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function setTrayRecording(recording) {
  if (recording && !pulseTimer) {
    pulseTimer = setInterval(() => {
      pulsePhase = !pulsePhase;
      tray?.setImage(buildRecordingIcon(pulsePhase));
    }, 700);
    tray?.setImage(buildRecordingIcon(false));
  } else if (!recording && pulseTimer) {
    clearInterval(pulseTimer);
    pulseTimer = null;
    tray?.setImage(ICON_IDLE());
    if (ambient) toggleAmbient(); // recording ended → leave ambient mode
  }
}

ipcMain.handle("aguacate:recording-state", (_event, recording) => {
  if (typeof recording !== "boolean") return { ok: false };
  setTrayRecording(recording);
  return { ok: true };
});

function registerShortcuts() {
  // Cmd+Shift+R on macOS, Ctrl+Shift+R on Windows — toggle recording
  const shortcuts = [
    ["CommandOrControl+Shift+R", () => sendShortcut("toggle-record")],
    ["CommandOrControl+Shift+A", () => toggleAmbient()],
    ["CommandOrControl+Shift+M", () => sendShortcut("drop-marker")],
  ];
  for (const [accel, handler] of shortcuts) {
    if (!globalShortcut.register(accel, handler)) {
      console.warn(`Global shortcut ${accel} is taken by another app`);
    }
  }
}

// ---------- IPC (all inputs validated, C6) ----------
ipcMain.handle("aguacate:get-backend", async () => {
  const info = await getBackendInfo();
  return { port: info.port, token: info.token };
});

const SAFE_EXTERNAL = /^(https:|http:|mailto:)/i;
ipcMain.handle("aguacate:open-external", async (_event, url) => {
  if (typeof url !== "string" || url.length > 2048 || !SAFE_EXTERNAL.test(url)) {
    return { ok: false, error: "Blocked URL" };
  }
  await shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle("aguacate:show-in-folder", async (_event, filePath) => {
  if (typeof filePath !== "string" || filePath.length > 1024) {
    return { ok: false, error: "Invalid path" };
  }
  const resolved = path.resolve(filePath);
  // Sandbox: only files inside our data directory may be revealed (C6).
  if (!resolved.startsWith(DATA_DIR + path.sep)) {
    return { ok: false, error: "Path outside Aguacate data directory" };
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: "File not found" };
  }
  shell.showItemInFolder(resolved);
  return { ok: true };
});

const WINDOW_ACTIONS = new Set(["minimize", "maximize", "close"]);
ipcMain.handle("aguacate:window-control", (_event, action) => {
  if (typeof action !== "string" || !WINDOW_ACTIONS.has(action) || !mainWindow) {
    return { ok: false };
  }
  if (action === "minimize") mainWindow.minimize();
  else if (action === "maximize") {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  } else if (action === "close") mainWindow.close(); // hides to tray
  return { ok: true };
});

ipcMain.handle("aguacate:notify", (_event, title, body) => {
  if (
    typeof title !== "string" ||
    typeof body !== "string" ||
    title.length === 0 ||
    title.length > 120 ||
    body.length > 400
  ) {
    return { ok: false };
  }
  if (!Notification.isSupported()) return { ok: false };
  const n = new Notification({ title, body, silent: true });
  n.on("click", () => showWindow());
  n.show();
  return { ok: true };
});

ipcMain.handle("aguacate:get-auto-launch", () => {
  try {
    return { enabled: app.getLoginItemSettings().openAtLogin === true };
  } catch {
    return { enabled: false };
  }
});

ipcMain.handle("aguacate:set-auto-launch", (_event, enabled) => {
  if (typeof enabled !== "boolean") return { ok: false };
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

// ---------- app lifecycle ----------
app.setAsDefaultProtocolClient("aguacate"); // license/Stripe callbacks (C9)

app.on("open-url", (event, url) => {
  event.preventDefault();
  // macOS deep links: aguacate://license/activated etc.
  if (mainWindow && typeof url === "string" && url.startsWith("aguacate://")) {
    mainWindow.webContents.send("aguacate:deep-link", url.slice(0, 2048));
  }
});

app.whenReady().then(() => {
  if (IS_DEV && process.platform === "darwin") {
    try {
      app.dock.setIcon(path.join(__dirname, "assets", "icon-1024.png"));
    } catch { /* dev nicety only */ }
  }
  if (!IS_DEV) registerAppProtocol();
  applyContentSecurityPolicy();
  startBackend();
  createWindow();
  createTray();
  registerShortcuts();
  app.on("activate", () => showWindow());
});

app.on("window-all-closed", () => {
  // Tray keeps the app alive on both platforms; Quit comes from the tray/menu.
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (backendProc) {
    backendProc.kill("SIGTERM");
    backendProc = null;
  }
});

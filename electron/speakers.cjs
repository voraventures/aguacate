// Metadata-only Zoom integration and opt-in Meet native-host registration.
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const EXTENSION_ID = 'hjifgailamaffpncpidoechbgfpkekjg';
module.exports = function createSpeakers({app, systemPreferences, shell, getInfo, resolveBackend, dataDir}) {
  let timer, busy = false, child, pending, buffer = '';
  const root = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  const zoomPath = path.join(root, 'native', 'bin', 'aguacate-zoom-speakers');
  const manifestPath = path.join(dataDir, 'speaker-native-host.json');
  async function request(action, body) {
    const info = getInfo();
    if (!info?.speakerToken) return {};
    const response = await fetch(`http://127.0.0.1:${info.port}/speaker-bridge/${action}`, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(1500),
      headers: {'Content-Type': 'application/json', 'X-Speaker-Bridge': info.speakerToken},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) return {};
    return response.json();
  }
  function stopHelper() {
    child?.kill(); child = null;
    if (pending) { clearTimeout(pending.timer); pending.resolve({windows: []}); pending = null; }
    buffer = '';
  }
  function scan(command) {
    if (!fs.existsSync(zoomPath) || !systemPreferences.isTrustedAccessibilityClient(false)) return Promise.resolve({windows: []});
    if (!child) {
      child = spawn(zoomPath, [], {stdio: ['pipe', 'pipe', 'ignore']});
      const launched = child;
      child.on('error', () => { if (child === launched) stopHelper(); });
      child.on('exit', () => { if (child === launched) stopHelper(); });
      child.stdin.on('error', () => { if (child === launched) stopHelper(); });
      child.stdout.on('data', chunk => {
        if (child !== launched) return;
        buffer += chunk.toString();
        if (buffer.length > 32768) { stopHelper(); return; }
        const end = buffer.indexOf('\n');
        if (end < 0 || !pending) return;
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        const request = pending; pending = null; clearTimeout(request.timer);
        try { request.resolve(JSON.parse(line)); } catch { request.resolve({windows: []}); }
      });
    }
    return new Promise(resolve => {
      pending = {resolve, timer: setTimeout(stopHelper, 2000)};
      child.stdin.write(command + '\n');
    });
  }
  async function tick() {
    if (busy || process.platform !== 'darwin') return;
    busy = true;
    try {
      if (!(await request('state')).active) { stopHelper(); return; }
      const offered = await scan('offer');
      // Offer every candidate before reading names; ambiguous windows abstain.
      const windows = offered.windows || [];
      const answers = [];
      for (const window of windows) answers.push(await request('offer', {source: 'zoom', target: window.target, url: window.url}));
      if (windows.length !== 1 || !answers[0]?.collect) return;
      const snapshot = await scan('scan:' + windows[0].target);
      const window = snapshot.windows?.find(w => w.target === windows[0].target);
      if (window) await request('activity', {source: 'zoom', target: window.target, url: window.url,
        session: answers[0].session, observed_at: snapshot.observed_at, participants: window.participants,
        connection: window.participants?.length ? 'connected' : 'unavailable'});
    } catch { stopHelper(); }
    finally { busy = false; }
  }
  function status() {
    return {zoom: process.platform !== 'darwin' ? 'unsupported' : !fs.existsSync(zoomPath) ? 'helper_missing' :
      systemPreferences.isTrustedAccessibilityClient(false) ? 'experimental' : 'permission_required',
      meet: fs.existsSync(manifestPath) ? 'host_registered' : 'setup_required', qualified: false};
  }
  function setupMeet() {
    fs.mkdirSync(dataDir, {recursive: true});
    let executable = path.join(root, 'speaker-host', process.platform === 'win32' ? 'aguacate-speaker-host.exe' : 'aguacate-speaker-host');
    if (!app.isPackaged && process.platform !== 'win32') {
      const python = resolveBackend().exe;
      if (!fs.existsSync(python)) return {error: 'runtime_missing'};
      executable = path.join(dataDir, 'speaker-native-host');
      const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
      fs.writeFileSync(executable, `#!/bin/sh\nexport AGUACATE_DATA_DIR=${quote(dataDir)}\nexec ${quote(python)} ${quote(path.join(root, 'backend/native_host.py'))} "$@"\n`, {mode: 0o700});
    }
    if (!fs.existsSync(executable)) return {error: 'runtime_missing'};
    const manifest = JSON.stringify({name: 'app.aguacate.speakers', description: 'Aguacate meeting speaker metadata', path: executable,
      type: 'stdio', allowed_origins: [`chrome-extension://${EXTENSION_ID}/`]}, null, 2);
    fs.writeFileSync(manifestPath, manifest, {mode: 0o600});
    if (process.platform === 'win32') {
      for (const browser of ['Google\\Chrome', 'Microsoft\\Edge', 'BraveSoftware\\Brave-Browser']) {
        execFileSync('reg.exe', ['ADD', `HKCU\\Software\\${browser}\\NativeMessagingHosts\\app.aguacate.speakers`, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], {windowsHide: true, stdio: 'ignore'});
      }
    } else {
      for (const browser of ['Google/Chrome', 'Microsoft Edge', 'BraveSoftware/Brave-Browser']) {
        const directory = path.join(app.getPath('appData'), browser, 'NativeMessagingHosts');
        fs.mkdirSync(directory, {recursive: true});
        fs.writeFileSync(path.join(directory, 'app.aguacate.speakers.json'), manifest, {mode: 0o600});
      }
    }
    shell.openPath(path.join(root, 'extensions', 'meet'));
    return status();
  }
  return {
    start() { if (!timer) timer = setInterval(tick, 300); },
    stop() { clearInterval(timer); timer = null; stopHelper(); },
    status,
    setup(action) {
      if (action === 'zoom' && process.platform === 'darwin') systemPreferences.isTrustedAccessibilityClient(true);
      if (action === 'meet') return setupMeet();
      return status();
    },
  };
};

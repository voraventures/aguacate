# Aguacate

**AI meeting notes. No bot. No cloud.**

Aguacate is a local-first AI meeting intelligence app for macOS. It records meetings
on-device, transcribes them locally with Whisper, has Claude write structured
executive notes, and surfaces cross-meeting intelligence: actions, decisions,
topics, and people.

## How it works

```
mic + (optional) system loopback ─▶ 16kHz WAV ─▶ faster-whisper (local)
        ─▶ transcript ─▶ Claude API (text only) ─▶ structured notes
        ─▶ intelligence index (actions / decisions / topics / people)
```

Audio never leaves the machine. Only the transcript text is sent to the
Anthropic API to generate notes.

## Requirements

- macOS (Apple Silicon or Intel) **or Windows 11**
- Node 20+ and Python 3.11 or 3.12 (`brew install python@3.11` / `winget install Python.Python.3.11`)
- An Anthropic API key (entered in Settings → AI, stored in the OS keychain)
- System audio: macOS uses [BlackHole](https://existential.audio/blackhole/)
  (optional, free); **Windows needs nothing** — Aguacate taps WASAPI loopback natively

## Setup

macOS:
```bash
cd backend && python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ..
npm install
npm run dev          # vite + electron; backend spawned automatically
```

Windows (PowerShell):
```powershell
cd backend; py -3.11 -m venv .venv; .venv\Scripts\pip install -r requirements.txt; cd ..
npm install
npm run dev
```

Installers (signed-ready; add your certs/identity to sign):
```bash
npm run dist:mac     # → release/Aguacate-*.dmg
npm run dist:win     # → release/Aguacate-Setup-*.exe (NSIS, x64 + arm64)
```

First launch: open **Settings → AI** and paste your Anthropic API key.
Pick your mic and system-audio device under **Settings → Recording**
(BlackHole on macOS, any "(loopback)" entry on Windows).

Desktop niceties: tray icon (show/hide, record toggle, quit), native
notifications for recording/transcription/notes/calendar events, launch-at-login
toggle in Settings → Recording, and a global **⌘/Ctrl+Shift+R** record shortcut.

### Calendar auto-record (optional)

Copy `credentials.example.json` to
`~/Library/Application Support/Aguacate/credentials.json` and add your own
**public** OAuth client IDs (PKCE — no client secrets are ever stored or
shipped). Apple Calendar needs no setup — just enable it in Settings.

## Security model

| Control | Implementation |
|---|---|
| No secrets in build | No `extraResources`; electron-builder excludes `credentials*.json` and `.env*`; PKCE-only OAuth |
| Backend auth | Random per-launch token, handed to renderer via IPC only; required on every route; WS requires token + Origin check |
| CORS / rebinding | Explicit origin allowlist (dev server + `app://aguacate`); Host-header allowlist middleware |
| XSS | Markdown parsed into React elements — zero `innerHTML` / `dangerouslySetInnerHTML` |
| File permissions | Data dir `700`; DB, audio, transcripts, notes, exports `600` |
| IPC | `contextIsolation` + `sandbox` on; `openExternal` allowlisted to https/http/mailto; `showItemInFolder` restricted to the data dir |
| Rate limiting | Token buckets per route class (license, recording, calendar sync, notes) |
| Error handling | Generic 500s externally; tracebacks logged server-side only |
| OAuth | PKCE with single-use CSRF state + 10-min TTL; `aguacate://` protocol registered |
| Secrets at rest | macOS Keychain via `keyring` for API keys, tokens, webhooks |

## License tiers

- **Free** — 5 lifetime meetings
- **Pro** — $20/month, validated against the license server with a 72h offline grace

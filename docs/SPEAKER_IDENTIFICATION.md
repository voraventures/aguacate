# Speaker identification — development handoff

Status: **local pipeline implemented; platform attribution is experimental, not production-qualified.** The installed Aguacate app was not replaced. No extension was installed/published, no customer meeting was used, and no paid AI request was made. Speaker identification defaults off until the user enables it in Recording settings.

## What is implemented

- CPU-only sherpa-onnx 1.13.7 / sherpa-onnx-core 1.13.7, pyannote segmentation 3.0 and 3D-Speaker ERes2Net-base embeddings. Models total 46,552,205 download bytes. Exact URLs, byte sizes, archive hashes and extracted ONNX hashes are pinned in `backend/app/services/speaker_models.py`.
- One-time model download, progress, cancellation, retry, strict archive extraction and SHA-256 verification. Readiness rechecks files when their metadata changes. The MIT segmentation license and Apache notices are retained beside installed models. No cloud fallback.
- Disposable local analysis worker, serialized CPU inference, a two-hour timeout, and transcript-preserving failure recovery. Worker stderr is suppressed; its output contains only time intervals and meeting-local voice IDs. Embeddings are never saved or logged. Long-recording resource limits still need qualification.
- Word timestamps in full-file Whisper, incremental blocks and tail transcription. Speaker changes split at words; unknown/overlapping words remain anonymous. If word text does not reproduce the segment, preserve the original segment rather than dropping text. Multi-word redaction removes unsafe word copies and deliberately sacrifices fine alignment.
- Analysis runs between transcription and note generation. Attributed text feeds existing transcript consumers. Notes are told that labels are untrusted display names, not verified identities or evidence of action ownership.
- Backward-compatible transcript analysis JSON and meeting-local speaker fields; a cascading `speaker_events` table stores synchronized activity and connection state. Participant IDs are hashed with meeting/window/tab scope; no raw platform IDs or embeddings are retained. Existing recordings are not automatically rewritten.
- Model failures leave the transcript usable. Explicit local retry is available only for this release's failed/missing-model analyses, not legacy recordings. Retry does not regenerate existing notes or call an AI provider; existing notes can consequently remain unattributed until the user regenerates them separately.
- Recording settings setup area, connection/status display, named Transcript and Timeline, timestamped transcript copy/download, source caveat, recovery warning and all six languages. Existing recording entitlements and capture controls are unchanged.

## Platform adapters: important limits

The Zoom Swift helper compiles, and the Meet MV3 extension/native-host code is present. **Neither has been validated in a controlled real platform call. Their current accessibility/DOM selectors are provisional semantic contracts, not observed compatibility with current Zoom or Meet builds. They may produce no names on current versions.** Do not advertise working Zoom/Meet support yet.

- Zoom: read-only AX queries for the `us.zoom.xos` process, bounded window/tree traversal, explicit meeting-window identifiers and explicit active-speaker semantics. It does not click, record screens or request screenshots. It does not read names until the backend accepts the window association. Both helper identity/TCC behavior and actual AX structure need validation, including non-English platform UI.
- Meet: content script restricted to `https://meet.google.com/*`, top frame only, exact meeting-code URL, explicit participant/speaking attributes. It checks active recording before inspecting participant nodes. It does not capture media, chat or browser history. DOM changes/missing indicators fail closed. Actual tile/participant identifiers, speaking indicators, duplicates and layout variants must be observed and qualified before selectors are finalized.
- Unique window/tab association uses process/window identity or browser-profile/tab identity; calendar join URLs can constrain the call ID but titles/attendee order never establish identity. Multiple offered calls block attribution, even if one matches the calendar link. Unknown/unsupported concurrent calls cannot be enumerated reliably yet: validate this before release.
- Evidence requires single-speaker snapshots no more than 0.8 seconds apart; at least 2 seconds and 30% coverage of the acoustic cluster; at least 90% agreement; less than 0.5 seconds of conflicting evidence. These are conservative engineering thresholds, not calibrated identity probabilities. A shared-room name is a room/device label.
- Recorder frame counts establish the saved-audio clock. Same-device epoch timestamps account for delivery age; events older than 0.75 seconds, future/out-of-order/replayed events and stale sessions are rejected. Pause/mute/enable boundaries rotate the session nonce and clear association. Pauses drop frames; privacy mute writes silence. Windows loopback now honors privacy mute as the microphone path already did.
- Disconnections are inferred when activity expires; explicit unavailable/disconnected snapshots are supported. Reconnects must re-establish a unique candidate. Missing intervals provide no evidence. Device startup skew, AX/browser latency, wall-clock adjustments, sleep/wake and mixed microphone/system-track drift remain real-call validation items.

## Bridge security

The Meet host is allowlisted to development extension ID `hjifgailamaffpncpidoechbgfpkekjg`. The manifest includes only the public key; no signing private key is in the repository. Publishing with another ID requires updating every matching allowlist.

Native messaging uses 4-byte length-prefixed JSON, a 16 KiB message limit, a restricted operation list and exact extension-origin validation. The service worker rejects foreign senders, non-top frames and non-Meet call URLs. No page-world message channel is installed.

The host reads a private per-launch **metadata-only** bridge capability from `speaker-bridge.json`. This is not the desktop API token. It is never passed to page scripts or the renderer. Requests go to fixed loopback paths without system proxies, with separate authentication, bounded bodies, rate limiting and schema validation. Browser Origin headers are denied. The backend rejects inactive, stale, cross-session, ambiguous and replayed activity.

Display names are redacted before persistence and again before attribution. Participant names/embeddings are excluded from new logs. Speaker metadata stays in the existing database, so meeting deletion/retention cascades and the existing encrypted-vault database backup include it. Bridge credentials are outside the vault's included files. A full vault export/restore and crash/restart recovery exercise still needs validation on each OS.

## Verification performed on this Mac

- 24 isolated backend tests: consistent/returning voices, conflicts, missing/stale/overlapping evidence, participant renames, duplicate names, shared rooms, unknown words, redaction, word offsets, both Whisper entry paths using a stub recognizer, session/pause/mute boundaries, multiple calls, database defaults/cascades, bridge auth/schema bounds, native-host origin/frame rejection, corrupt/cancelled model downloads, integrity rechecks, legacy-retry rejection, successful local retry and worker failure.
- 15 Node/DOM tests including the existing meeting-card suite: named Transcript/Timeline, export text, failed settings writes, Meet adapter contract, extension scope and six-language key parity.
- 54 Chromium speaker-settings layout checks: light/dark × small/medium/large × 900×600 / 1320×860 / 1600×1000 × 260/300/480 px list widths. All passed. Keyboard/labels and existing dock behavior covered by DOM tests. Synthetic preview is isolated from the backend.
- Renderer production build, Python compilation, Electron/extension syntax checks, Swift helper compilation and `git diff --check` passed. Existing Vite >500 kB chunk warning remains.
- Actual pinned model installer exercised with locally cached, hash-verified official assets; actual sherpa CPU inference exercised using **locally synthesized** Samantha/Daniel test audio, not human/customer recordings.

Latest synthetic benchmark (macOS Apple Silicon, Python 3.14; not a minimum-spec guarantee):

| Fixture | Result |
|---|---|
| 48.81 s, two voices returning after 5 s pauses | 3.57 s analysis; 0.073 real-time factor; 436,781,056-byte worker peak RSS; 2 clusters, 4 turns |
| Simulated platform evidence on that sample | 2 named clusters; 38.59 s named overlap; 0.03 s wrong named overlap at a turn boundary |
| 8 s digital silence / low-level noise | 0 turns / 0 turns |
| Rapid alternating 1.5 s excerpts | **Collapsed into 1 cluster**; not acceptable evidence of rapid-exchange accuracy |
| 5 s mixed overlapping voices | 2 clusters; accurate word ownership not established |

These numbers are smoke measurements, **not diarization error rate or real-platform attribution accuracy**. A consented/licensed human multi-speaker corpus, real Whisper inference on both paths, long/noisy meetings, and controlled platform calls are still required. In particular, tune and evaluate rapid exchanges before making accuracy claims.

## Developer setup (not run against the installed app)

Install `backend/requirements.txt` into a development virtual environment. Build only the source helper with `npm run build:zoom-helper` on macOS. For isolated backend tests:

```sh
python -m pytest tests/backend/test_speakers.py -q
AGUACATE_TEST_DEPS=/path/to/temporary/jsdom-install node --test --test-force-exit tests/ui.test.mjs tests/meeting-cards.test.mjs tests/speakers.test.mjs
npm run build
```

The tests override `AGUACATE_DATA_DIR` with temporary directories. `tests/backend/speaker_smoke.py` accepts a temporary folder containing the two pinned assets and locally synthesized 16 kHz mono `voice-a.wav` / `voice-b.wav`. It makes no network requests.

For an explicitly authorized **development** platform call, launch a separate source app with a temporary data directory, enable speaker identification, download the models, and use Recording settings setup. Zoom requires Accessibility approval for the actual helper/app identity. Meet setup registers the native host for user-level Chrome/Edge/Brave and opens `extensions/meet`; load it unpacked through the browser's extension UI. Merely registering the host does not install the extension. Do not grant or exercise permissions on unrelated real meetings.

The standalone host spec is `backend/speaker-host.spec`. Build it on each target OS before any future packaging; macOS command is `npm run build:speaker-host`, Windows uses that environment's Python/PyInstaller. Resource declarations are added, but release CI, cross-architecture helper builds, signatures/notarization, native-host registration/uninstall and installer bundling have **not** been qualified. No installers were rebuilt in this task. The backend's existing data-directory defaults are preserved, including its legacy Windows location; no automatic data migration was introduced.

## Release gate / next validation

1. Controlled, consented Zoom and Meet calls with two/three people; observe actual accessibility/DOM structure, finalize selectors, measure frame-clock offset and name precision. Test supported Zoom/browser builds, macOS/Windows, denied/revoked permissions, tab moves, simultaneous calls, participant renames, duplicate names, shared rooms, reconnects and changed layouts.
2. Licensed/consented human audio corpus: returning speakers, rapid exchanges, overlap, silence/noise, multiple languages and long meetings. Report DER, false-name attribution and abstention separately. Tune conservatively; silence must never create a new identity.
3. Real full/incremental Whisper alignment, pause/privacy-mute including Windows loopback, crash/restart, missing audio, interrupted installation, deletion during analysis, retention and encrypted-vault round trip. Synthetic events do not qualify any platform integration.
4. Target-OS runtime/package/license/signature review and signed controlled-call builds before changing the `qualified: false` declarations or exposing production-support claims.

References: [sherpa pipeline](https://github.com/k2-fsa/sherpa-onnx/blob/master/python-api-examples/offline-speaker-diarization.py), [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [Granola Zoom approach](https://docs.granola.ai/help-center/taking-notes/speaker-attribution-zoom), [Granola Meet approach](https://docs.granola.ai/help-center/taking-notes/speaker-attribution-google-meet). These document the approach, not compatibility of this implementation's provisional selectors.

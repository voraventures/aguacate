---
name: aguacate-rebuild-architecture
description: Stack, Python 3.11 venv, BlackHole-only audio testing, run commands, and premium features added June 2026
metadata:
  type: project
---

Aguacate is an Electron app with a FastAPI Python backend. The renderer is React + Vite.

**Run backend:** `cd backend && .venv/bin/uvicorn app.main:app --port 8765`
**Run frontend (dev):** `npm run dev` from project root
**Build:** `npm run build`
**Python venv:** `backend/.venv` (Python 3.11)
**Audio testing:** BlackHole-only (no microphone required for testing)

## Premium Features added 2026-06-13

**F1 - Speaker Diarization**
- `backend/app/services/transcriber.py`: `diarize_segments()` uses silence-gap heuristic (>1.5s = new speaker). Returns segments with `speaker` field. Also adds `transcribe_chunk()` for live preview with tiny model.
- `backend/app/services/notes.py`: speaker-aware prompt when transcript has "Speaker N:" labels.
- `src/components/NotesPanel.jsx`: Notes/Transcript tab bar; `TranscriptView` component renders speaker badges. Segments exposed via `meeting.transcript._segments`.
- Segments are now returned (not stripped) from `GET /api/meetings/{id}`.

**F2 - Real-time Transcript Display**
- `backend/app/services/recorder.py`: `_emit_live_transcript()` thread emits `transcript_chunk` WS events every 10s using the tiny whisper model.
- `src/store.jsx`: `liveTranscriptChunks` state accumulates chunks; cleared on recording start/stop.
- `src/components/LiveTranscript.jsx`: renders chunks with partial-opacity last chunk + blinking cursor.

**F3 - Zoom/Meet/Teams Detection**
- `backend/app/routes/system.py`: `GET /api/system/active-calls` runs `ps aux` and matches against known call app names.
- `src/store.jsx`: polls every 30s; `activeCall` state + `dismissActiveCall()`.
- `src/components/Sidebar.jsx`: amber detection banner with "Record now" / "Dismiss" buttons.

**F4 - Team Workspaces**
- `backend/app/db.py`: added `workspaces`, `workspace_members` tables; `workspace_id` column on `meetings`.
- `backend/app/routes/workspace.py`: create/join/leave/list endpoints + `share_meeting_to_workspace()`.
- `backend/app/routes/meetings.py`: `POST /api/meetings/{id}/share-to-workspace`.
- `src/store.jsx`: `workspace` state + `refreshWorkspace()`.
- `src/components/Settings.jsx`: Workspace tab with create/join/member list/share-path config.
- `src/components/MeetingList.jsx`: Team tab (visible only when in a workspace).
- `src/components/NotesPanel.jsx`: "Share to team" in three-dot menu; "Shared" badge in tab bar.

**F5 - Mobile API**
- `backend/app/db.py`: added `mobile_sessions` table.
- `backend/app/routes/mobile.py`: `/api/mobile/auth`, `/api/mobile/meetings`, `/api/mobile/actions`, `/api/mobile/search`, session management.
- CORS: `aguacate-ios://app` added to allowed origins.
- `src/components/Settings.jsx`: Mobile section in Export tab (connect + revoke sessions).
- `MOBILE_API.md`: full API documentation at project root.

**Why:** Capability test — 5 premium features in one session. All registered in `backend/app/main.py`.

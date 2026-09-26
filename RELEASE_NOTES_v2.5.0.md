## v2.5.0 — AI included, licensing fixed, crash-proof recording

**Notes are ready seconds after the call ends.** Transcription now runs live during the meeting, so only the last few seconds are processed when you stop recording instead of the whole file.

**Join from the calendar alert.** One minute before a meeting with a video link, Jotva shows a banner with a Join button. Click it to open the call; once people start talking, Jotva offers to record (or starts on its own, depending on your recording mode).

**Bundled AI — no API key needed.** Meeting notes are now generated through Jotva's included AI (Claude Haiku 4.5) for free and Pro users alike. Adding your own Anthropic, OpenAI, or Google key in Settings is still supported and switches Jotva to your own account.

**Payment path repaired.** The in-app "Get Pro" flow previously could not reach the license server (blocked by the app's own security policy) and the sidebar upgrade button took payment without linking a license. Both are fixed; checkout now activates your license automatically.

**Recordings survive crashes.** Audio is streamed to disk continuously instead of held in memory. If the app quits mid-meeting, the recording is recovered on next launch and processed normally. Memory use stays flat for meetings of any length.

**Licensing hardened.** Licenses are cryptographically verified in the app; the empty-key developer bypass is closed; the license server enforces install-ID format, expiry, and replay protection.

**Also fixed**
- App no longer hangs on the splash screen if the backend fails to start
- A failed recording start no longer leaves a phantom "recording" meeting or burns a free-tier slot
- Recurring Meetings view no longer crashes on a malformed meeting date
- Calendar events sort correctly across time zones and providers
- Search treats `%` and `_` literally
- Team workspace polling recovers after leaving and rejoining
- Various resource leaks (database connections, WebSocket timers, live-transcript buffer)
- Non-functional mobile pairing and public share-link buttons removed from the UI

**macOS:** signed and notarized DMG. **Windows:** built by CI from this tag.

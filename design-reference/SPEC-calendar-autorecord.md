# Calendar-linked auto-recording — plan

## Principle
Extends "zero manual labor": for calendar meetings, the user does nothing at all —
no manual Record tap required. Manual Record remains for ad-hoc/unscheduled conversations.

## Flow
1. **Connect calendar** — Google / Apple / Outlook. Already exists in Settings; not
   redesigned in this pass.
2. Aguacate reads upcoming events that carry a video-call link (Zoom/Meet/Teams).
3. **5 minutes before start** — an in-app banner/toast appears (non-blocking, dismissible):
   *"[Meeting title] starts in 5 min — Aguacate will auto-transcribe once you join."*
4. **Join detection** — Aguacate detects the user joining the call natively
   (Zoom/Meet/Teams integration). No confirmation step, no manual action.
5. Recording + transcription start automatically. The meeting behaves exactly like a
   manually captured one from here (processing → ready → Overview/Timeline/Transcript/Ask).
6. **Manual "Record"** (sidebar) stays for ad-hoc meetings with no calendar event — same
   capture flow, just user-triggered instead of calendar-triggered.

## New states needed
- **Scheduled/upcoming** meeting card — shown in the Meetings list *before* the event
  starts, so the user can see and trust what Aguacate is about to auto-capture.
- **Banner/toast** — the 5-minute heads-up. Transient, dismissible, calm (not a modal).
- (Low priority) a subtle source indicator — calendar-triggered vs manually recorded —
  on the meeting card, if useful later.

## Meetings list changes
Add an **"Upcoming"** group above "Today": each row shows time-until-start, the event
title (from the calendar — may not match the eventual AI-generated meeting name), and a
quiet "will auto-transcribe" affordance so the user isn't surprised when recording starts.

## Explicitly out of scope for this pass
- Redesigning the calendar-connect screen in Settings (exists already).
- Actual Zoom/Meet/Teams SDK/join-detection engineering.

## Design options explored
See canvas, turn 6: three treatments for the upcoming/scheduled list row + the 5-minute
banner/toast.

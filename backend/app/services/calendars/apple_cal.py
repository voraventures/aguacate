"""Apple Calendar via local EventKit (through osascript/JXA). Fully local."""
import json
import logging
import subprocess
from datetime import datetime, timedelta, timezone

log = logging.getLogger("aguacate.applecal")

# JXA script: today's window events from all local calendars as JSON.
_JXA = """
ObjC.import('EventKit');
function run(argv) {
  const hours = parseInt(argv[0] || '18', 10);
  const store = $.EKEventStore.alloc.init;
  let granted = false;
  // Synchronous-enough permission check; events query fails silently if denied.
  const sema = $.dispatch_semaphore_create(0);
  store.requestFullAccessToEventsWithCompletion(function(ok, err) {
    granted = ok; $.dispatch_semaphore_signal(sema);
  });
  $.dispatch_semaphore_wait(sema, $.dispatch_time($.DISPATCH_TIME_NOW, 10 * 1e9));
  if (!granted) { return JSON.stringify({error: 'access_denied', events: []}); }
  const now = $.NSDate.date;
  const end = $.NSDate.dateWithTimeIntervalSinceNow(hours * 3600);
  const start = $.NSDate.dateWithTimeIntervalSinceNow(-3600);
  const pred = store.predicateForEventsWithStartDateEndDateCalendars(start, end, $());
  const events = store.eventsMatchingPredicate(pred);
  const out = [];
  const fmt = $.NSISO8601DateFormatter.alloc.init;
  for (let i = 0; i < events.count; i++) {
    const ev = events.objectAtIndex(i);
    const attendees = [];
    if (!ev.attendees.isNil()) {
      for (let j = 0; j < ev.attendees.count; j++) {
        const name = ev.attendees.objectAtIndex(j).name;
        if (!name.isNil()) attendees.push(ObjC.unwrap(name));
      }
    }
    out.push({
      provider_id: ObjC.unwrap(ev.eventIdentifier) || '',
      title: ObjC.unwrap(ev.title) || 'Untitled event',
      start: ObjC.unwrap(fmt.stringFromDate(ev.startDate)),
      end: ObjC.unwrap(fmt.stringFromDate(ev.endDate)),
      attendees: attendees,
      cancelled: ev.status === $.EKEventStatusCanceled
    });
  }
  return JSON.stringify({error: null, events: out});
}
"""


def is_available() -> bool:
    return True  # macOS always has osascript; permission is requested on first use


def fetch_events(hours_ahead: int = 18) -> list[dict]:
    try:
        proc = subprocess.run(
            ["osascript", "-l", "JavaScript", "-e", _JXA, str(hours_ahead)],
            capture_output=True,
            text=True,
            timeout=20,
        )
        if proc.returncode != 0:
            log.warning("Apple Calendar JXA failed: %s", proc.stderr.strip()[:200])
            return []
        payload = json.loads(proc.stdout.strip() or "{}")
        if payload.get("error"):
            log.info("Apple Calendar: %s", payload["error"])
            return []
        events = []
        for ev in payload.get("events", []):
            events.append(
                {
                    "provider": "apple",
                    "provider_id": ev.get("provider_id", ""),
                    "title": ev.get("title", "Untitled event"),
                    "start": ev.get("start"),
                    "end": ev.get("end"),
                    "attendees": ev.get("attendees", []),
                    "cancelled": bool(ev.get("cancelled")),
                }
            )
        return events
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError) as exc:
        log.warning("Apple Calendar fetch failed: %s", exc)
        return []

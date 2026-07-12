"""Apple Calendar via local EventKit (through osascript/JXA). Fully local."""
import json
import logging
import subprocess
from datetime import datetime, timedelta, timezone

log = logging.getLogger("aguacate.applecal")

# JXA script: today's window events from all local calendars as JSON.
#
# Permission is checked with the SYNCHRONOUS EKEventStore.authorizationStatusForEntityType
# (EKEntityTypeEvent = 0). The GCD dispatch_semaphore_* functions used previously are not
# bridged into JXA ($.dispatch_semaphore_create is undefined), so the old async-request +
# semaphore pattern threw before the request was even made and every fetch silently returned
# no events. EKAuthorizationStatus: 0 notDetermined, 1 restricted, 2 denied, 3 fullAccess.
_JXA = """
ObjC.import('EventKit');
ObjC.import('Foundation');
function run(argv) {
  const hours = parseInt(argv[0] || '18', 10);
  let status = Number($.EKEventStore.authorizationStatusForEntityType(0)) | 0;
  if (status === 0) {
    // First run: fire the request to surface the OS prompt, then spin the run loop
    // briefly so it registers. The completion handler is unreliable in a short-lived
    // osascript process, so we re-read the status instead of awaiting the callback.
    const s0 = $.EKEventStore.alloc.init;
    s0.requestFullAccessToEventsWithCompletion(function(ok, err) {});
    const deadline = $.NSDate.dateWithTimeIntervalSinceNow(2);
    while ($.NSDate.date.compare(deadline) < 0) {
      $.NSRunLoop.currentRunLoop.runModeBeforeDate($.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.1));
    }
    status = Number($.EKEventStore.authorizationStatusForEntityType(0)) | 0;
  }
  if (status !== 3) {
    return JSON.stringify({error: status === 0 ? 'not_determined' : 'access_denied', events: []});
  }
  const store = $.EKEventStore.alloc.init;
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
      cancelled: ev.status === $.EKEventStatusCanceled,
      location: ev.location.isNil() ? '' : ObjC.unwrap(ev.location),
      url: ev.URL.isNil() ? '' : ObjC.unwrap(ev.URL.absoluteString),
      notes: ev.notes.isNil() ? '' : ObjC.unwrap(ev.notes)
    });
  }
  return JSON.stringify({error: null, events: out});
}
"""


def is_available() -> bool:
    return True  # macOS always has osascript; permission is requested on first use


# JXA probe: read the current EventKit authorization status SYNCHRONOUSLY and report
# it. authorizationStatusForEntityType needs no completion handler and no GCD semaphore
# (the previous dispatch_semaphore_create version was undefined in JXA and always threw,
# so a real denial silently returned success). EKEntityTypeEvent = 0; EKAuthorizationStatus:
# 0 notDetermined, 1 restricted, 2 denied, 3 fullAccess, 4 writeOnly.
_JXA_PROBE = """
ObjC.import('EventKit');
function run() {
  const status = Number($.EKEventStore.authorizationStatusForEntityType(0)) | 0;
  return JSON.stringify({status: status});
}
"""


def probe_access() -> str | None:
    """Return "access_denied" if EventKit calendar access is denied or restricted,
    else None.

    Reads the current authorization status synchronously. notDetermined (the prompt
    has not been answered) and fullAccess both return None — only an explicit denial
    or MDM/parental restriction surfaces "access_denied". Transient failures (missing
    osascript, timeout, malformed output) also return None so the caller doesn't
    surface a false "access denied" on a flaky probe.
    """
    try:
        proc = subprocess.run(
            ["osascript", "-l", "JavaScript", "-e", _JXA_PROBE],
            capture_output=True,
            text=True,
            timeout=20,
        )
        if proc.returncode != 0:
            log.warning("Apple Calendar access probe failed: %s", proc.stderr.strip()[:200])
            return None
        payload = json.loads(proc.stdout.strip() or "{}")
        # 1 restricted, 2 denied → the app cannot read calendars; surface it.
        if payload.get("status") in (1, 2):
            return "access_denied"
        return None
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError) as exc:
        log.warning("Apple Calendar access probe error: %s", exc)
        return None


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
                    "native_link": ev.get("url"),
                    "location": ev.get("location"),
                    "description": ev.get("notes"),
                }
            )
        return events
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError) as exc:
        log.warning("Apple Calendar fetch failed: %s", exc)
        return []

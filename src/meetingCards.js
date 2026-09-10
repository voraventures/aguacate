// Calendar-day helpers: never divide elapsed milliseconds to identify local days.
export function validDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isFinite(+date) ? date : null;
}

export function localDayKey(value) {
  const d = validDate(value);
  return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : "unknown";
}

export function groupRecordings(meetings, now) {
  const todayKey = localDayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDayKey(yesterday);
  const groups = new Map();
  for (const meeting of [...meetings].sort((a, b) => (+(validDate(b.started_at)) || 0) - (+(validDate(a.started_at)) || 0))) {
    const key = localDayKey(meeting.started_at);
    if (!groups.has(key)) groups.set(key, { key, date: validDate(meeting.started_at), kind: key === todayKey ? "today" : key === yesterdayKey ? "yesterday" : key === "unknown" ? "unknown" : "date", meetings: [] });
    groups.get(key).meetings.push(meeting);
  }
  return { today: groups.get(todayKey)?.meetings || [], older: [...groups.values()].filter(g => g.key !== todayKey) };
}

export function eligibleUpcoming(events, now) {
  return events.filter(e => !e.cancelled && !e.recorded_meeting_id && validDate(e.start) && +validDate(e.start) > +now)
    .sort((a, b) => +validDate(a.start) - +validDate(b.start));
}

export function calendarDate(value, locale, options = {}) {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", ...options }).format(date) : "";
}

export function scheduledTime(value, locale, includeDate = false) {
  const date = validDate(value);
  return date ? new Intl.DateTimeFormat(locale, { ...(includeDate ? { month: "short", day: "numeric", year: "numeric" } : {}), hour: "numeric", minute: "2-digit" }).format(date) : "";
}

export function meetingDuration(meeting, locale) {
  const start = validDate(meeting.started_at), end = validDate(meeting.ended_at);
  if (!start || !end || end <= start) return "";
  const minutes = Math.round((end - start) / 60000);
  if (minutes < 1) return "";
  const unit = (n, name) => new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "short" }).format(n);
  return minutes < 60 ? unit(minutes, "minute") : [unit(Math.floor(minutes / 60), "hour"), minutes % 60 ? unit(minutes % 60, "minute") : ""].filter(Boolean).join(" ");
}

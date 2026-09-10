import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calendarDate, eligibleUpcoming, groupRecordings, localDayKey, meetingDuration, scheduledTime, validDate } from "../src/meetingCards.js";

test("local calendar groups survive midnight and both daylight-saving boundaries", () => {
  const original = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    for (const [month, day, hours] of [[2, 9, 23], [10, 2, 25]]) {
      const now = new Date(2026, month, day, 0, 0);
      const prior = new Date(2026, month, day - 1, 0, 0);
      assert.equal((now - prior) / 3600000, hours);
      const meeting = { id: "prior", started_at: prior.toISOString() };
      assert.equal(groupRecordings([meeting], now).older[0].kind, "yesterday");
      assert.equal(groupRecordings([meeting], prior).today.length, 1);
    }
    const meeting = { started_at: "2026-09-10T03:59:59Z" };
    assert.equal(groupRecordings([meeting], new Date("2026-09-10T03:59:59Z")).today.length, 1);
    assert.equal(groupRecordings([meeting], new Date("2026-09-10T04:00:00Z")).older[0].kind, "yesterday");
    assert.equal(localDayKey(meeting.started_at), "2026-8-9");
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});

test("nearest future event excludes cancelled, recorded, past, and invalid events", () => {
  const now = new Date("2026-09-09T12:00:00Z");
  const event = { id: "next", start: "2026-09-09T13:00:00Z" };
  assert.deepEqual(eligibleUpcoming([
    { ...event, id: "later", start: "2026-09-10T13:00:00Z" },
    { ...event, id: "cancelled", cancelled: true }, { ...event, recorded_meeting_id: "recorded" },
    { ...event, start: now.toISOString() }, { ...event, start: "2026-09-08T12:00:00Z" },
    { ...event, start: "invalid" }, { ...event, start: null }, event,
  ], now).map(e => e.id), ["next", "later"]);
});

test("invalid dates and durations are omitted; history remains grouped and localized", async () => {
  for (const value of [null, undefined, "", "not-a-date"]) {
    assert.equal(validDate(value), null);
    assert.equal(scheduledTime(value, "en"), "");
    assert.equal(calendarDate(value, "en"), "");
  }
  const start = "2026-09-09T12:00:00Z";
  for (const end of [null, "invalid", start, "2026-09-08T12:00:00Z"])
    assert.equal(meetingDuration({ started_at: start, ended_at: end }, "en"), "");
  assert.equal(meetingDuration({ started_at: start, ended_at: "2026-09-09T13:30:00Z" }, "en"), "1 hr 30 min");
  const groups = groupRecordings([{ started_at: null }, { started_at: "2026-08-01T12:00:00Z" }, { started_at: "2026-09-01T12:00:00Z" }], new Date(start));
  assert.equal(groups.today.length, 0);
  assert.deepEqual(groups.older.map(g => g.kind), ["date", "date", "unknown"]);
  assert.deepEqual(groupRecordings([], new Date(start)), { today: [], older: [] });
  const keys = ["upNext", "recordedToday", "noRecordingsToday", "yesterday", "unknownDate", "searchResults", "recording", "processing", "failed"];
  for (const locale of ["en", "es", "fr", "ko", "pt", "zh"]) {
    const strings = JSON.parse(await readFile(`src/locales/${locale}/translation.json`, "utf8"));
    assert.deepEqual(Object.keys(strings.list.cards).sort(), [...keys].sort());
    assert.ok(scheduledTime(start, locale, true));
    assert.ok(meetingDuration({ started_at: start, ended_at: "2026-09-09T12:30:00Z" }, locale));
  }
});

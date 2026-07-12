// Meeting list — recreated from AguacateChrome.dc.html: a "Search meetings"
// field (search lives here now, not as a separate nav destination), an
// "Upcoming" group for real calendar events about to be auto-captured (per
// SPEC-calendar-autorecord.md), then a calendar date-badge per row (month
// strip + day number), title + duration, grouped "Today" / "Earlier". The
// active row is a white card with a hairline and a green check.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { useStore } from "../store.jsx";
import { CheckIcon, ChevronDownIcon, DotsIcon, MicIcon, SearchIcon } from "./icons.jsx";
import { Confirm } from "./ui.jsx";

function minutesUntil(iso, now) {
  return Math.round((new Date(iso) - now) / 60000);
}

function UpcomingRow({ e, now }) {
  const { t } = useTranslation();
  const mins = minutesUntil(e.start, now);
  const when =
    mins <= 1 ? t("list.upcoming.startingNow") : t("list.upcoming.inMinutes", { count: mins });
  return (
    <div className="upcoming-row">
      <span className="upcoming-row-dot" aria-hidden="true" />
      <div className="upcoming-row-main">
        <div className="row-title">{e.title}</div>
        <div className="row-meta">
          <span>{when}</span>
          {e.join_url && (
            <span className="upcoming-row-tag">{t("list.upcoming.autoTranscribe")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function durationLabel(m) {
  if (!m.started_at || !m.ended_at) return "";
  const mins = Math.round((new Date(m.ended_at) - new Date(m.started_at)) / 60000);
  if (mins < 1) return "";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60 ? `${mins % 60}m` : ""}`.trim();
}

function timeOfDay(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function daysAgo(iso, now) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
}

function DateBadge({ iso, isToday }) {
  const d = iso ? new Date(iso) : new Date();
  return (
    <div className="date-badge">
      <div className={`date-badge-month${isToday ? " today" : ""}`}>{MONTHS[d.getMonth()]}</div>
      <div className="date-badge-day">{d.getDate()}</div>
    </div>
  );
}

function MeetingRow({ m, selected, onSelect, progress, onDeleteRequest, now }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocMouseDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [menuOpen]);

  const stage = progress[m.id]?.stage || m.status;
  const busy = ["recording", "transcribing", "generating"].includes(stage);
  const isToday = daysAgo(m.started_at, now) === 0;
  const dur = durationLabel(m);
  const when = isToday ? timeOfDay(m.started_at) : dur;

  return (
    <button className={`meeting-row${selected ? " active" : ""}`} onClick={() => onSelect(m.id)}>
      <DateBadge iso={m.started_at} isToday={isToday} />
      <div className="meeting-row-main">
        <div className="row-title">
          {m.title}
          {!!m.is_demo && <span className="demo-badge">{t("list.demoBadge")}</span>}
        </div>
        <div className="row-meta">
          {when && <span>{when}</span>}
          {isToday && dur && <span>{" · " + dur}</span>}
          {busy && <span className="row-status">{t("list.status.growing")}</span>}
          {stage === "error" && <span className="row-status error">{t("list.status.failed")}</span>}
        </div>
      </div>
      {selected && stage === "ready" && (
        <span className="row-ready" aria-hidden="true">
          <CheckIcon size={10} />
        </span>
      )}
      <span className={`row-menu${menuOpen ? " open" : ""}`} ref={menuRef}>
        <span
          className="row-menu-btn"
          role="button"
          tabIndex={0}
          aria-label={t("list.menu.options")}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <DotsIcon size={14} />
        </span>
        {menuOpen && (
          <span className="card-menu-dropdown" role="menu">
            <span
              className="delete-menu-item"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDeleteRequest(m);
              }}
            >
              {t("list.menu.delete")}
            </span>
          </span>
        )}
      </span>
    </button>
  );
}

export default function MeetingList({ children }) {
  const { t } = useTranslation();
  const {
    meetings,
    selectedId,
    selectMeeting,
    progress,
    startRecording,
    recording,
    deleteMeeting,
    upcoming,
  } = useStore();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const now = new Date();

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return undefined;
    }
    const tmr = setTimeout(() => {
      api
        .get(`/api/meetings/search?q=${encodeURIComponent(query.trim())}`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(tmr);
  }, [query]);

  const { today, earlier } = useMemo(() => {
    const t0 = [];
    const e0 = [];
    for (const m of meetings) (daysAgo(m.started_at, now) === 0 ? t0 : e0).push(m);
    return { today: t0, earlier: e0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings]);

  const upcomingEvents = useMemo(
    () => upcoming.filter((e) => !e.cancelled && !e.recorded_meeting_id),
    [upcoming]
  );

  const searching = query.trim().length > 0;

  return (
    <div className="list-panel" data-tour="meeting-list">
      <div className="list-top">
        <div className="list-search">
          <SearchIcon size={15} />
          <input
            placeholder={t("list.searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
        </div>

        {!searching && (
          <div className="list-head">
            <span className="list-scope">{t("list.scopeToday")}</span>
            <ChevronDownIcon size={14} />
          </div>
        )}
      </div>

      <div className="list-scroll">
        {searching ? (
          <>
            {results === null && <div className="list-no-match">{t("common.loading")}</div>}
            {results?.length === 0 && <div className="list-no-match">{t("list.noMatch", { query })}</div>}
            {results?.map((m) => (
              <MeetingRow
                key={m.id}
                m={m}
                selected={selectedId === m.id}
                onSelect={selectMeeting}
                progress={progress}
                onDeleteRequest={setDeleteTarget}
                now={now}
              />
            ))}
          </>
        ) : (
          <>
            {meetings.length === 0 && upcomingEvents.length === 0 && (
              <div className="empty-state">
                <div className="empty-title">{t("list.empty.allHead")}</div>
                <div className="empty-sub">{t("list.empty.allSub")}</div>
                {!recording.active && (
                  <button className="empty-cta" onClick={() => startRecording()}>
                    <MicIcon size={14} /> {t("list.startRecording")}
                  </button>
                )}
              </div>
            )}
            {upcomingEvents.length > 0 && (
              <>
                <div className="group-label">{t("list.group.upcoming")}</div>
                {upcomingEvents.map((e) => (
                  <UpcomingRow key={e.id} e={e} now={now} />
                ))}
              </>
            )}
            {today.map((m) => (
              <MeetingRow
                key={m.id}
                m={m}
                selected={selectedId === m.id}
                onSelect={selectMeeting}
                progress={progress}
                onDeleteRequest={setDeleteTarget}
                now={now}
              />
            ))}
            {earlier.length > 0 && <div className="group-label">{t("list.group.earlier")}</div>}
            {earlier.map((m) => (
              <MeetingRow
                key={m.id}
                m={m}
                selected={selectedId === m.id}
                onSelect={selectMeeting}
                progress={progress}
                onDeleteRequest={setDeleteTarget}
                now={now}
              />
            ))}
          </>
        )}
      </div>
      {deleteTarget && (
        <Confirm
          title={t("list.deleteTitle")}
          body={t("list.deleteBody", { title: deleteTarget.title })}
          confirmLabel={t("common.delete")}
          danger
          onConfirm={() => {
            deleteMeeting(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {children}
    </div>
  );
}

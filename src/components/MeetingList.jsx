import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { useStore } from "../store.jsx";
import { ClockIcon, MicIcon, SearchIcon, UsersIcon } from "./icons.jsx";
import { EmptyMeetings } from "./illustrations.jsx";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function DateIcon({ iso }) {
  const d = iso ? new Date(iso) : new Date();
  return (
    <div className="date-icon">
      <div className="dmonth">{MONTHS[d.getMonth()]}</div>
      <div className="dday">{d.getDate()}</div>
    </div>
  );
}

function timeOfDay(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusChip({ meeting, progress }) {
  const p = progress[meeting.id];
  const status = p?.stage || meeting.status;
  if (status === "ready") return null;
  if (status === "recording")
    return (
      <span className="status-chip recording">
        <span className="spinner" /> Recording
      </span>
    );
  if (status === "error")
    return <span className="status-chip error">Failed — open for details</span>;
  const labels = {
    transcribing: p?.pct
      ? `Transcribing ${Math.round(p.pct * 100)}%`
      : "Transcribing",
    generating: "Writing notes",
  };
  return (
    <span className="status-chip processing">
      <span className="spinner" /> {labels[status] || "Processing"}
    </span>
  );
}

function MeetingCard({ m, selected, onSelect, progress }) {
  const { deleteMeeting } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the dropdown when clicking anywhere outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocMouseDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [menuOpen]);

  const onDelete = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (window.confirm("Delete this meeting? This cannot be undone.")) {
      deleteMeeting(m.id);
    }
  };

  return (
    <button
      className={`meeting-card${selected ? " active" : ""}`}
      onClick={() => onSelect(m.id)}
    >
      <DateIcon iso={m.started_at} />
      <div className="meeting-info">
        <div className="meeting-title">{m.title}</div>
        <div className="meeting-sub">
          <span className="sub-item">
            <ClockIcon size={11} />
            {timeOfDay(m.started_at)}
          </span>
          {Array.isArray(m.attendees) && m.attendees.length > 0 && (
            <span className="sub-item">
              <UsersIcon size={11} />
              {m.attendees.length}
            </span>
          )}
        </div>
        <StatusChip meeting={m} progress={progress} />
      </div>
      <span className={`meeting-menu${menuOpen ? " open" : ""}`} ref={menuRef}>
        <span
          className="meeting-menu-btn"
          role="button"
          tabIndex={0}
          title="More options"
          aria-label="Meeting options"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </span>
        {menuOpen && (
          <span className="card-menu-dropdown" role="menu">
            <span className="delete-menu-item" role="menuitem" onClick={onDelete}>
              Delete meeting
            </span>
          </span>
        )}
      </span>
    </button>
  );
}

export default function MeetingList({ onCollapse, children }) {
  const { meetings, selectedId, selectMeeting, progress, upcoming, startRecording, recording } =
    useStore();
  const [tab, setTab] = useState("all"); // all | recent | open
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [askResults, setAskResults] = useState(null); // semantic search
  const [asking, setAsking] = useState(false);

  const ask = () => {
    const q = query.trim();
    if (q.length < 3) return;
    setAsking(true);
    setAskResults(null);
    api
      .post("/api/search/ask", { query: q })
      .then((r) => setAskResults(r.results))
      .catch(() => setAskResults([]))
      .finally(() => setAsking(false));
  };

  useEffect(() => {
    setAskResults(null);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .get(`/api/meetings/search?q=${encodeURIComponent(query.trim())}`)
        .then(setSearchResults)
        .catch(() => setSearchResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const visible = useMemo(() => {
    let list = searchResults ?? meetings;
    if (tab === "recent") {
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      list = list.filter((m) => new Date(m.started_at).getTime() >= cutoff);
    } else if (tab === "open") {
      list = list.filter((m) => (m.open_actions ?? 0) > 0);
    }
    return list;
  }, [meetings, searchResults, tab]);

  const upcomingVisible = upcoming.filter((e) => !e.recorded_meeting_id).slice(0, 4);

  return (
    <div className="list-panel" data-tour="meeting-list">
      <div className="list-header">
        <div className="list-title-row">
          <div className="list-title serif">Meetings</div>
          <button
            className="collapse-btn"
            title="Collapse list"
            aria-label="Collapse meeting list"
            onClick={onCollapse}
          >
            ‹
          </button>
        </div>
        <div className="search-bar">
          <SearchIcon size={13} />
          <input
            placeholder="Ask Aguacate..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            spellCheck={false}
          />
          {query.trim().length >= 3 && (
            <button className="ask-btn" onClick={ask} title="Semantic search across all notes">
              {asking ? "…" : "ASK ⏎"}
            </button>
          )}
        </div>
        <div className="segmented">
          {["all", "recent", "open"].map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t === "all" ? "All" : t === "recent" ? "Recent" : "Open"}
            </button>
          ))}
        </div>
      </div>

      {upcomingVisible.length > 0 && (
        <div className="upcoming-block">
          <div className="section-eyebrow" style={{ paddingTop: 6 }}>
            Up next
          </div>
          {upcomingVisible.map((ev) => (
            <div
              key={ev.id}
              className={`upcoming-event${ev.cancelled ? " cancelled" : ""}`}
            >
              <span className="ev-time">{timeOfDay(ev.start)}</span>
              <span className="ev-title">{ev.title}</span>
            </div>
          ))}
        </div>
      )}

      <div className="meeting-scroll">
        {asking && (
          <div className="ask-result">
            <div className="ask-kicker">ASKING AGUACATE…</div>
            <div className="processing-ring" style={{ width: 22, height: 22, margin: "8px auto" }} />
          </div>
        )}
        {askResults && (
          <div className="ask-results">
            <div className="ask-kicker">
              {askResults.length ? "FROM YOUR MEETINGS" : "NO ANSWER FOUND IN YOUR MEETINGS"}
            </div>
            {askResults.map((r, i) => (
              <button key={i} className="ask-result" onClick={() => selectMeeting(r.meeting_id)}>
                {r.answer && <div className="ask-answer">{r.answer}</div>}
                <div className="ask-excerpt">"{r.excerpt}"</div>
                <div className="intel-sub">
                  {r.title} · {new Date(r.date).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        )}
        {visible.length === 0 &&
          (query ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--muted)", fontSize: 12.5 }}>
              No meetings match "{query}". Try a person, topic, or action item.
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "40px 16px", height: "auto" }}>
              <div className="empty-art">
                <EmptyMeetings size={104} />
              </div>
              <div className="empty-title" style={{ fontSize: 16 }}>
                {tab === "all" ? "No meetings yet" : tab === "recent" ? "Nothing in the last 7 days" : "No open action items"}
              </div>
              <div className="empty-sub" style={{ fontSize: 12, textAlign: "center", lineHeight: 1.5 }}>
                {tab === "all"
                  ? "Record your first meeting to get started"
                  : tab === "recent"
                    ? "Meetings from the past week will show up in this tab."
                    : "Meetings with unfinished action items will collect here."}
              </div>
              {tab === "all" && !recording.active && (
                <button className="empty-cta" onClick={() => startRecording()}>
                  <MicIcon size={14} /> Start Recording
                </button>
              )}
            </div>
          ))}
        {visible.map((m) => (
          <MeetingCard
            key={m.id}
            m={m}
            selected={selectedId === m.id}
            onSelect={selectMeeting}
            progress={progress}
          />
        ))}
      </div>
      {children}
    </div>
  );
}

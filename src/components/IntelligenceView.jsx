// Cross-meeting intelligence: list column + detail panel for
// Actions / Decisions / Topics / People.
import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useStore } from "../store.jsx";
import { ArrowIcon, CheckIcon, ClockIcon } from "./icons.jsx";
import { EMPTY_ART } from "./illustrations.jsx";

const TITLES = {
  actions: "Actions",
  decisions: "Decisions",
  topics: "Topics",
  people: "People",
  series: "Series",
};

function ageDays(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

const EMPTY_COPY = {
  actions: {
    headline: "No open actions",
    sub: "Action items from your meetings will appear here",
  },
  decisions: {
    headline: "No decisions recorded",
    sub: "Decisions captured in your meetings will appear here",
  },
  topics: {
    headline: "No topics yet",
    sub: "Topics will surface as you record more meetings",
  },
  people: {
    headline: "No contributors yet",
    sub: "People from your meetings will appear here",
  },
  series: {
    headline: "No recurring meetings yet",
    sub: "When the same meeting happens twice, Aguacate starts tracking the series",
  },
};

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function initials(name) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function IntelligenceView() {
  const { nav, setNav, selectMeeting, showToast, refreshMyWork } = useStore();
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(null);
  const [actionFilter, setActionFilter] = useState("open"); // open | completed | all

  const load = () => {
    api
      .get(`/api/intelligence/${nav}`)
      .then((data) => {
        setItems(data);
        setSelected((prev) => (prev !== null && prev < data.length ? prev : null));
      })
      .catch(() => setItems([]));
  };

  useEffect(() => {
    setItems(null);
    setSelected(null);
    load();
  }, [nav]); // eslint-disable-line react-hooks/exhaustive-deps

  const goToMeeting = (meetingId) => {
    setNav("meetings");
    selectMeeting(meetingId);
  };

  const toggleDone = (item) => {
    const next = item.status === "done" ? "open" : "done";
    api
      .patch(`/api/intelligence/actions/${item.id}`, { status: next })
      .then(() => {
        load();
        refreshMyWork();
      })
      .catch((e) => showToast(e.message, "error"));
  };

  // Actions can be filtered by completion; other views pass through unchanged.
  const view =
    items && nav === "actions"
      ? items.filter((it) =>
          actionFilter === "all"
            ? true
            : actionFilter === "completed"
              ? it.status === "done"
              : it.status !== "done"
        )
      : items;

  const sel = selected !== null && view ? view[selected] : null;

  return (
    <>
      <div className="list-panel">
        <div className="list-header">
          <div className="list-title serif">{TITLES[nav]}</div>
          {nav === "actions" && (
            <div className="segmented" style={{ marginTop: 10, maxWidth: 300 }}>
              {[
                ["all", "All"],
                ["open", "Open"],
                ["completed", "Completed"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={actionFilter === key ? "active" : ""}
                  onClick={() => {
                    setActionFilter(key);
                    setSelected(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="intel-list">
          {items === null && (
            <div className="processing-state" style={{ padding: "40px 0" }}>
              <div className="processing-ring" />
            </div>
          )}
          {view && view.length === 0 && (
            <div className="empty-state" style={{ padding: "40px 16px", height: "auto" }}>
              <div className="empty-art">
                {React.createElement(EMPTY_ART[nav] || EMPTY_ART.meetings, { size: 104 })}
              </div>
              <div className="empty-title" style={{ fontSize: 16 }}>
                {nav === "actions" && actionFilter === "completed"
                  ? "No completed actions"
                  : EMPTY_COPY[nav].headline}
              </div>
              <div className="empty-sub" style={{ fontSize: 12, textAlign: "center", lineHeight: 1.5 }}>
                {EMPTY_COPY[nav].sub}
              </div>
              <button className="empty-cta" onClick={() => setNav("meetings")}>
                Go to Meetings
              </button>
            </div>
          )}
          {(view || []).map((item, i) => (
            <button
              key={item.id || item.name || i}
              className={`intel-row${selected === i ? " active" : ""}`}
              onClick={() => setSelected(i)}
            >
              {nav === "actions" && (
                <>
                  <span className={`owner-chip${!item.owner || item.owner === "TBD" ? " tbd" : ""}`}>
                    {item.owner || "TBD"}
                  </span>
                  <div className="intel-main">
                    <div className={`intel-text${item.status === "done" ? " done" : ""}`}
                      style={item.status === "done" ? { textDecoration: "line-through", opacity: 0.55 } : undefined}
                    >
                      {item.action}
                    </div>
                    <div className="intel-sub">
                      {item.due ? `Due ${item.due} · ` : ""}
                      {item.meeting_title}
                      {item.status === "open" && ageDays(item.meeting_date) > 14 && (
                        <span className="stale-chip"> stale · {ageDays(item.meeting_date)}d</span>
                      )}
                    </div>
                  </div>
                </>
              )}
              {nav === "decisions" && (
                <div className="intel-main">
                  <div className="intel-text">{item.text}</div>
                  <div className="intel-sub">
                    {fmtDate(item.meeting_date)} · {item.meeting_title}
                  </div>
                </div>
              )}
              {nav === "topics" && (
                <>
                  <div className="intel-main">
                    <div className="intel-text" style={{ fontWeight: 600 }}>
                      {item.name}
                    </div>
                    <div className="intel-sub">
                      {item.meetings?.length ?? 0} meeting{(item.meetings?.length ?? 0) !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <span className="count-badge">{item.mentions}</span>
                </>
              )}
              {nav === "series" && (
                <>
                  <div className="intel-main">
                    <div className="intel-text" style={{ fontWeight: 600 }}>
                      {item.name}
                    </div>
                    <div className="intel-sub">
                      {item.count} occurrences
                      {item.cadence_days ? ` · every ~${item.cadence_days}d` : ""}
                    </div>
                  </div>
                  <span className="count-badge">{item.count}</span>
                </>
              )}
              {nav === "people" && (
                <>
                  <span className="avatar">{initials(item.name ?? "")}</span>
                  <div className="intel-main">
                    <div className="intel-text" style={{ fontWeight: 600 }}>
                      {item.name}
                    </div>
                    <div className="intel-sub">
                      {item.action_count} action{item.action_count !== 1 ? "s" : ""}
                      {item.open_actions ? ` · ${item.open_actions} open` : ""}
                    </div>
                  </div>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="detail-panel">
        <div className="detail-inner">
          {!sel ? (
            <div className="empty-state" style={{ paddingTop: 80 }}>
              <div className="empty-art">
                {React.createElement(EMPTY_ART[nav] || EMPTY_ART.meetings, { size: 120 })}
              </div>
              <div className="empty-title">Select {nav === "people" ? "a person" : `a ${nav.slice(0, -1)}`}</div>
              <div className="empty-sub">Pick an item from the list to see its detail</div>
            </div>
          ) : nav === "actions" ? (
            <>
              <div className="detail-head">
                <div className="detail-kicker">Action Item</div>
                <div className="detail-title">{sel.action}</div>
              </div>
              <div className="meta-pills">
                <span className={`pill${!sel.owner || sel.owner === "TBD" ? "" : " rec"}`}>
                  Owner: {sel.owner || "TBD"}
                </span>
                {sel.due && (
                  <span className="pill">
                    <ClockIcon size={11} /> Due {sel.due}
                  </span>
                )}
                <span className="pill">{sel.status === "done" ? "Done" : "Open"}</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn secondary" onClick={() => toggleDone(sel)}>
                  <CheckIcon size={13} />
                  {sel.status === "done" ? "Reopen" : "Mark done"}
                </button>
                <button className="source-link" style={{ marginTop: 0 }} onClick={() => goToMeeting(sel.meeting_id)}>
                  {sel.meeting_title} <ArrowIcon size={13} />
                </button>
              </div>
            </>
          ) : nav === "decisions" ? (
            <>
              <div className="detail-head">
                <div className="detail-kicker">Decision</div>
                <div className="detail-title">{sel.text}</div>
              </div>
              <div className="meta-pills">
                <span className="pill">
                  <ClockIcon size={11} /> {fmtDate(sel.meeting_date)}
                </span>
              </div>
              <button className="source-link" onClick={() => goToMeeting(sel.meeting_id)}>
                {sel.meeting_title} <ArrowIcon size={13} />
              </button>
            </>
          ) : nav === "topics" ? (
            <>
              <div className="detail-head">
                <div className="detail-kicker">Topic</div>
                <div className="detail-title">{sel.name}</div>
              </div>
              <div className="meta-pills">
                <span className="pill rec">{sel.mentions} mention{sel.mentions !== 1 ? "s" : ""}</span>
              </div>
              <div className="section-card">
                <div className="section-label">Discussed in</div>
                {(sel.meetings ?? []).map((mt, i) => (
                  <button key={i} className="related-row" onClick={() => goToMeeting(mt.id)}>
                    <span className="related-title">{mt.title}</span>
                    <span className="intel-sub">{fmtDate(mt.date)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : nav === "series" ? (
            <>
              <div className="detail-head">
                <div className="detail-kicker">Meeting Series</div>
                <div className="detail-title">{sel.name}</div>
              </div>
              <div className="meta-pills">
                <span className="pill rec">{sel.count} meetings</span>
                {sel.cadence_days > 0 && <span className="pill">every ~{sel.cadence_days} days</span>}
                {sel.completion_pct != null && (
                  <span className="pill">{sel.completion_pct}% actions completed</span>
                )}
              </div>
              {sel.open_actions + sel.done_actions > 0 && (
                <div className="ai-meta-bar">
                  <span className="ai-meta-item">
                    <strong>{sel.open_actions}</strong> open actions
                  </span>
                  <span className="ai-meta-item">
                    <strong>{sel.done_actions}</strong> completed
                  </span>
                </div>
              )}
              {(sel.recurring_topics?.length ?? 0) > 0 && (
                <div className="section-card">
                  <div className="section-label">Recurring topics</div>
                  <div className="section-body">
                    <ul>
                      {sel.recurring_topics.map((t) => (
                        <li key={t.name}>
                          <strong className="topic-chip">{t.name}</strong> — has come up in{" "}
                          {t.meetings} of {sel.count} meetings
                          {t.meetings >= 3 ? " without resolution dropping off the agenda" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              <div className="section-card">
                <div className="section-label">In this series</div>
                {(sel.meetings ?? []).map((mt) => (
                  <button key={mt.id} className="related-row" onClick={() => goToMeeting(mt.id)}>
                    <span className="related-title">{mt.title}</span>
                    <span className="intel-sub">{fmtDate(mt.date)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="detail-head">
                <div className="detail-kicker">Person</div>
                <div className="detail-title">{sel.name}</div>
              </div>
              <div className="meta-pills">
                <span className="pill rec">{sel.action_count} action{sel.action_count !== 1 ? "s" : ""}</span>
                {sel.open_actions > 0 && <span className="pill">{sel.open_actions} open</span>}
                {sel.meeting_count > 0 && <span className="pill">{sel.meeting_count} meeting{sel.meeting_count !== 1 ? "s" : ""}</span>}
              </div>
              {(sel.recent_actions?.length ?? 0) > 0 && (
                <div className="section-card">
                  <div className="section-label">Recent actions</div>
                  {sel.recent_actions.map((a, i) => (
                    <div className="action-row" key={i}>
                      <span className="action-text">{a.action}</span>
                      {a.due && <span className="action-due">{a.due}</span>}
                      <button className="tool-btn" onClick={() => goToMeeting(a.meeting_id)}>
                        View
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

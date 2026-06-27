// Cross-meeting intelligence: list column + detail panel for
// Actions / Decisions / Topics / People / Series / Conflicts.
import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useStore } from "../store.jsx";
import { ArrowIcon, CheckIcon, ClockIcon, SearchIcon, WarnIcon } from "./icons.jsx";
import { EMPTY_ART } from "./illustrations.jsx";

const TITLES = {
  actions: "Actions",
  decisions: "Decisions",
  topics: "Topics",
  people: "People",
  series: "Series",
  conflicts: "Conflicts",
};

const TREND = { rising: "↑", recurring: "→", fading: "↓" };

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
  conflicts: {
    headline: "No conflicts detected",
    sub: "When a new decision contradicts an earlier one, it shows up here",
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

const isSuperseded = (d) => /superseded|contradicted/i.test(d?.status || "");

// Series: predict the next occurrence from cadence + the latest meeting date.
function nextExpected(sel) {
  const last = sel.meetings?.[0]?.date;
  if (!last || !sel.cadence_days) return null;
  const next = new Date(new Date(last).getTime() + sel.cadence_days * 86400000);
  if (next.getTime() >= Date.now()) {
    return next.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  }
  return `~${sel.cadence_days} days`;
}

export default function IntelligenceView() {
  const { nav, setNav, selectMeeting, showToast, refreshMyWork } = useStore();
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(null);
  const [actionFilter, setActionFilter] = useState("open"); // open | completed | all | mine
  const [userName, setUserName] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [rangeDays, setRangeDays] = useState(0); // 0 = all time
  const [pendingPerson, setPendingPerson] = useState(null);
  const [seriesActions, setSeriesActions] = useState([]);
  const [topicDecisions, setTopicDecisions] = useState([]);

  const load = () => {
    api
      .get(`/api/intelligence/${nav}`)
      .then((data) => {
        setItems(data);
        if (nav === "people" && pendingPerson) {
          const o = pendingPerson.toLowerCase();
          const idx = data.findIndex((p) => {
            const n = (p.name || "").toLowerCase();
            return n === o || n.includes(o) || o.includes(n);
          });
          setSelected(idx >= 0 ? idx : null);
          setPendingPerson(null);
        } else {
          setSelected((prev) => (prev !== null && prev < data.length ? prev : null));
        }
      })
      .catch(() => setItems([]));
  };

  useEffect(() => {
    setItems(null);
    setSelected(null);
    load();
  }, [nav]); // eslint-disable-line react-hooks/exhaustive-deps

  // user_name for the "Mine" actions filter (Settings → General).
  useEffect(() => {
    api
      .get("/api/settings/user-name")
      .then((d) => setUserName(d.user_name || ""))
      .catch(() => {});
  }, []);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchInput.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  const goToMeeting = (meetingId) => {
    setNav("meetings");
    selectMeeting(meetingId);
  };

  const goToPerson = (name) => {
    setPendingPerson(name);
    setNav("people");
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

  // Actions filter by completion/ownership; other views pass through.
  const passesActionFilter = (it) => {
    if (actionFilter === "all") return true;
    if (actionFilter === "completed") return it.status === "done";
    if (actionFilter === "mine")
      return userName && (it.owner || "").trim().toLowerCase() === userName.toLowerCase();
    return it.status !== "done";
  };

  // Search matches any visible text field; date range matches any attached date.
  const haystack = (it) =>
    [it.action, it.owner, it.text, it.name, it.meeting_title, it.new_decision, it.old_decision, it.explanation]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  const withinRange = (it, cutoffMs) => {
    const dates = [];
    if (it.meeting_date) dates.push(it.meeting_date);
    if (it.new_date) dates.push(it.new_date);
    (it.meetings || []).forEach((m) => m.date && dates.push(m.date));
    (it.recent_actions || []).forEach((a) => a.meeting_date && dates.push(a.meeting_date));
    if (!dates.length) return true; // no date info → always visible
    return dates.some((d) => new Date(d).getTime() >= cutoffMs);
  };

  let view = items;
  if (view && nav === "actions") view = view.filter(passesActionFilter);
  if (view && query) view = view.filter((it) => haystack(it).includes(query));
  if (view && rangeDays) {
    const cutoff = Date.now() - rangeDays * 86400000;
    view = view.filter((it) => withinRange(it, cutoff));
  }

  const sel = selected !== null && view ? view[selected] : null;
  const selKey = sel ? sel.id || sel.key || sel.name : null;

  // Lazily pull the supporting lists a detail panel needs (carry-over actions,
  // related decisions) only once something is selected.
  useEffect(() => {
    if (!sel) return;
    if (nav === "series")
      api.get("/api/intelligence/actions").then(setSeriesActions).catch(() => setSeriesActions([]));
    if (nav === "topics")
      api.get("/api/intelligence/decisions").then(setTopicDecisions).catch(() => setTopicDecisions([]));
  }, [nav, selKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carry-over: open actions whose text recurs across 2+ meetings of the series.
  const carryOver = [];
  if (nav === "series" && sel) {
    const ids = new Set((sel.meetings || []).map((m) => m.id));
    const groups = {};
    seriesActions
      .filter((a) => a.status !== "done" && ids.has(a.meeting_id))
      .forEach((a) => {
        const k = (a.action || "").trim().toLowerCase();
        (groups[k] ||= { action: a.action, meetings: new Set() }).meetings.add(a.meeting_id);
      });
    carryOver.push(...Object.values(groups).filter((g) => g.meetings.size >= 2));
  }

  // Related decisions: decisions from the meetings this topic was discussed in.
  const relatedDecisions =
    nav === "topics" && sel
      ? topicDecisions.filter((d) =>
          new Set((sel.meetings || []).map((m) => m.id)).has(d.meeting_id)
        )
      : [];

  const mineNoName = nav === "actions" && actionFilter === "mine" && !userName;

  return (
    <>
      <div className="list-panel">
        <div className="intel-search" style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 14px 0" }}>
          <SearchIcon size={14} />
          <input
            className="intel-search-input"
            placeholder={`Search ${TITLES[nav].toLowerCase()}…`}
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setSelected(null);
            }}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13 }}
          />
          <select
            value={rangeDays}
            onChange={(e) => {
              setRangeDays(Number(e.target.value));
              setSelected(null);
            }}
            style={{ fontSize: 12 }}
          >
            <option value={0}>All time</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        <div className="list-header">
          <div className="list-title serif">{TITLES[nav]}</div>
          {nav === "actions" && (
            <div className="segmented" style={{ marginTop: 10, maxWidth: 380 }}>
              {[
                ["all", "All"],
                ["open", "Open"],
                ["completed", "Completed"],
                ["mine", "Mine"],
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
                {mineNoName
                  ? "Set your name in Settings → General to use this filter"
                  : nav === "actions" && actionFilter === "completed"
                    ? "No completed actions"
                    : EMPTY_COPY[nav].headline}
              </div>
              {!mineNoName && (
                <>
                  <div className="empty-sub" style={{ fontSize: 12, textAlign: "center", lineHeight: 1.5 }}>
                    {EMPTY_COPY[nav].sub}
                  </div>
                  <button className="empty-cta" onClick={() => setNav("meetings")}>
                    Go to Meetings
                  </button>
                </>
              )}
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
                  <div
                    className="intel-text"
                    style={isSuperseded(item) ? { textDecoration: "line-through", opacity: 0.55 } : undefined}
                  >
                    {item.text}
                  </div>
                  <div className="intel-sub">
                    {isSuperseded(item) && <span className="stale-chip">Superseded</span>}{" "}
                    {fmtDate(item.meeting_date)} · {item.meeting_title}
                  </div>
                </div>
              )}
              {nav === "topics" && (
                <>
                  <div className="intel-main">
                    <div className="intel-text" style={{ fontWeight: 600 }}>
                      {item.trend && (
                        <span title={item.trend} style={{ opacity: 0.7, marginRight: 5 }}>
                          {TREND[item.trend]}
                        </span>
                      )}
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
              {nav === "conflicts" && (
                <>
                  <span className="owner-chip tbd" style={{ display: "inline-flex", alignItems: "center" }}>
                    <WarnIcon size={12} />
                  </span>
                  <div className="intel-main">
                    <div className="intel-text">{item.new_decision}</div>
                    <div className="intel-sub">
                      contradicts an earlier decision · {fmtDate(item.new_date)}
                    </div>
                  </div>
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
                {sel.owner && sel.owner !== "TBD" ? (
                  <button className="pill rec" style={{ cursor: "pointer" }} onClick={() => goToPerson(sel.owner)}>
                    Owner: {sel.owner}
                  </button>
                ) : (
                  <span className="pill">Owner: TBD</span>
                )}
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
                <div
                  className="detail-title"
                  style={isSuperseded(sel) ? { textDecoration: "line-through", opacity: 0.55 } : undefined}
                >
                  {sel.text}
                </div>
              </div>
              <div className="meta-pills">
                {isSuperseded(sel) && <span className="pill">Superseded</span>}
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
                {sel.trend && <span className="pill">{TREND[sel.trend]} {sel.trend}</span>}
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
              {relatedDecisions.length > 0 && (
                <div className="section-card">
                  <div className="section-label">Related decisions</div>
                  {relatedDecisions.map((d, i) => (
                    <button key={i} className="related-row" onClick={() => goToMeeting(d.meeting_id)}>
                      <span className="related-title">{d.text}</span>
                      <span className="intel-sub">{fmtDate(d.meeting_date)}</span>
                    </button>
                  ))}
                </div>
              )}
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
              {nextExpected(sel) && (
                <div className="ai-meta-bar">
                  <span className="ai-meta-item">
                    Next expected: <strong>{nextExpected(sel)}</strong>
                  </span>
                </div>
              )}
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
              <div className="section-card">
                <div className="section-label">Carry-over actions</div>
                {carryOver.length === 0 ? (
                  <div className="section-body">No carry-over actions</div>
                ) : (
                  <ul>
                    {carryOver.map((c, i) => (
                      <li key={i}>
                        <strong>{c.action}</strong> — still open across {c.meetings.size} meetings
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
          ) : nav === "conflicts" ? (
            <>
              <div className="detail-head">
                <div className="detail-kicker">Conflict</div>
                <div className="detail-title">{sel.explanation || "Contradicting decisions"}</div>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                <div className="section-card" style={{ flex: 1 }}>
                  <div className="section-label">New decision</div>
                  <div className="section-body">{sel.new_decision}</div>
                  <button className="source-link" onClick={() => goToMeeting(sel.new_meeting_id)}>
                    {sel.new_meeting_title} <ArrowIcon size={13} />
                  </button>
                </div>
                <div className="section-card" style={{ flex: 1 }}>
                  <div className="section-label">Prior decision</div>
                  <div className="section-body" style={{ textDecoration: "line-through", opacity: 0.6 }}>
                    {sel.old_decision}
                  </div>
                  <button className="source-link" onClick={() => goToMeeting(sel.old_meeting_id)}>
                    {sel.old_meeting_title} <ArrowIcon size={13} />
                  </button>
                </div>
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
              {(() => {
                const seen = new Map();
                (sel.recent_actions || []).forEach((a) => {
                  if (a.meeting_id && !seen.has(a.meeting_id)) seen.set(a.meeting_id, a.meeting_title);
                });
                const mtgs = [...seen.entries()];
                return mtgs.length > 0 ? (
                  <div className="section-card">
                    <div className="section-label">Meetings</div>
                    {mtgs.map(([id, title]) => (
                      <button key={id} className="related-row" onClick={() => goToMeeting(id)}>
                        <span className="related-title">{title}</span>
                      </button>
                    ))}
                  </div>
                ) : null;
              })()}
            </>
          )}
        </div>
      </div>
    </>
  );
}

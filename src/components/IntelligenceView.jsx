// Library: cross-meeting intelligence — Actions / Decisions / Topics /
// People / Series / Conflicts as sub-sections of one destination.
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { useStore } from "../store.jsx";
import { ArrowIcon, CheckIcon, ClockIcon, SearchIcon, WarnIcon } from "./icons.jsx";
import { Select } from "./ui.jsx";

const SECTIONS = ["actions", "decisions", "topics", "people", "series", "conflicts"];

const TREND = { rising: "↑", recurring: "→", fading: "↓" };

function ageDays(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

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
  const { t } = useTranslation();
  const { setNav, selectMeeting, showToast, refreshMyWork } = useStore();
  const [section, setSection] = useState("actions");
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
      .get(`/api/intelligence/${section}`)
      .then((data) => {
        setItems(data);
        if (section === "people" && pendingPerson) {
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
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

  // user_name for the "Mine" actions filter (Settings → General).
  useEffect(() => {
    api
      .get("/api/settings/user-name")
      .then((d) => setUserName(d.user_name || ""))
      .catch(() => {});
  }, []);

  // Debounce the search box.
  useEffect(() => {
    const tmr = setTimeout(() => setQuery(searchInput.trim().toLowerCase()), 200);
    return () => clearTimeout(tmr);
  }, [searchInput]);

  const goToMeeting = (meetingId) => {
    setNav("meetings");
    selectMeeting(meetingId);
  };

  const goToPerson = (name) => {
    setPendingPerson(name);
    setSection("people");
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
  if (view && section === "actions") view = view.filter(passesActionFilter);
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
    if (section === "series")
      api.get("/api/intelligence/actions").then(setSeriesActions).catch(() => setSeriesActions([]));
    if (section === "topics")
      api.get("/api/intelligence/decisions").then(setTopicDecisions).catch(() => setTopicDecisions([]));
  }, [section, selKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carry-over: open actions whose text recurs across 2+ meetings of the series.
  const carryOver = [];
  if (section === "series" && sel) {
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
    section === "topics" && sel
      ? topicDecisions.filter((d) =>
          new Set((sel.meetings || []).map((m) => m.id)).has(d.meeting_id)
        )
      : [];

  const mineNoName = section === "actions" && actionFilter === "mine" && !userName;

  return (
    <div className="intel-split">
      <div className="intel-listcol">
        <div className="view-title" style={{ fontSize: 24, padding: "28px 10px 14px" }}>
          {t("sidebar.nav.library")}
        </div>
        <div className="lib-tabs">
          {SECTIONS.map((key) => (
            <button
              key={key}
              className={`lib-tab${section === key ? " active" : ""}`}
              onClick={() => {
                setSection(key);
                setSearchInput("");
              }}
            >
              {t(`intel.title.${key}`)}
            </button>
          ))}
        </div>
        <div className="intel-search-row">
          <SearchIcon size={14} />
          <input
            className="intel-search-input"
            placeholder={t("intel.searchPlaceholder", { section: t(`intel.title.${section}`) })}
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setSelected(null);
            }}
          />
          <Select
            ariaLabel={t("intel.range.all")}
            value={rangeDays}
            onChange={(v) => {
              setRangeDays(v);
              setSelected(null);
            }}
            options={[
              { value: 0, label: t("intel.range.all") },
              { value: 7, label: t("intel.range.d7") },
              { value: 30, label: t("intel.range.d30") },
              { value: 90, label: t("intel.range.d90") },
            ]}
          />
        </div>
        {section === "actions" && (
          <div className="segmented" style={{ margin: "0 10px 10px" }}>
            {["all", "open", "completed", "mine"].map((key) => (
              <button
                key={key}
                className={actionFilter === key ? "active" : ""}
                onClick={() => {
                  setActionFilter(key);
                  setSelected(null);
                }}
              >
                {t(`intel.filter.${key}`)}
              </button>
            ))}
          </div>
        )}
        <div className="intel-list">
          {items === null && (
            <div className="skeleton-rows" aria-hidden="true">
              {[68, 52, 60, 44, 56].map((w, i) => (
                <div key={i} className="skeleton" style={{ height: 40, width: `${w + 30}%` }} />
              ))}
            </div>
          )}
          {view && view.length === 0 && (
            <div className="empty-state" style={{ padding: "40px 16px", height: "auto" }}>
              <div className="empty-title" style={{ fontSize: 16 }}>
                {mineNoName
                  ? t("intel.filter.mineHint")
                  : section === "actions" && actionFilter === "completed"
                    ? t("intel.list.noCompleted")
                    : t(`intel.empty.${section}.head`)}
              </div>
              {!mineNoName && (
                <div className="empty-sub" style={{ fontSize: 12, textAlign: "center", lineHeight: 1.5 }}>
                  {t(`intel.empty.${section}.sub`)}
                </div>
              )}
            </div>
          )}
          {(view || []).map((item, i) => (
            <button
              key={item.id || item.name || i}
              className={`intel-row${selected === i ? " active" : ""}`}
              onClick={() => setSelected(i)}
            >
              {section === "actions" && (
                <>
                  <span className={`owner-chip${!item.owner || item.owner === "TBD" ? " tbd" : ""}`}>
                    {item.owner || t("intel.list.tbd")}
                  </span>
                  <div className="intel-main">
                    <div className={`intel-text${item.status === "done" ? " struck" : ""}`}>
                      {item.action}
                    </div>
                    <div className="intel-sub">
                      {item.due ? `${t("intel.list.due", { due: item.due })} · ` : ""}
                      {item.meeting_title}
                      {item.status === "open" && ageDays(item.meeting_date) > 14 && (
                        <span className="stale-chip"> {t("intel.list.staleDays", { days: ageDays(item.meeting_date) })}</span>
                      )}
                    </div>
                  </div>
                </>
              )}
              {section === "decisions" && (
                <div className="intel-main">
                  <div className={`intel-text${isSuperseded(item) ? " struck" : ""}`}>
                    {item.text}
                  </div>
                  <div className="intel-sub">
                    {isSuperseded(item) && <span className="stale-chip">{t("intel.list.superseded")}</span>}{" "}
                    {fmtDate(item.meeting_date)} · {item.meeting_title}
                  </div>
                </div>
              )}
              {section === "topics" && (
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
                      {t("intel.list.meetingCount", { count: item.meetings?.length ?? 0 })}
                    </div>
                  </div>
                  <span className="count-badge">{item.mentions}</span>
                </>
              )}
              {section === "series" && (
                <>
                  <div className="intel-main">
                    <div className="intel-text" style={{ fontWeight: 600 }}>
                      {item.name}
                    </div>
                    <div className="intel-sub">
                      {t("intel.list.occurrenceCount", { count: item.count })}
                      {item.cadence_days ? ` · ${t("intel.list.cadence", { cadence: item.cadence_days })}` : ""}
                    </div>
                  </div>
                  <span className="count-badge">{item.count}</span>
                </>
              )}
              {section === "conflicts" && (
                <>
                  <span className="owner-chip tbd" style={{ display: "inline-flex", alignItems: "center" }}>
                    <WarnIcon size={12} />
                  </span>
                  <div className="intel-main">
                    <div className="intel-text">{item.new_decision}</div>
                    <div className="intel-sub">
                      {t("intel.list.contradicts", { date: fmtDate(item.new_date) })}
                    </div>
                  </div>
                </>
              )}
              {section === "people" && (
                <>
                  <span className="avatar">{initials(item.name ?? "")}</span>
                  <div className="intel-main">
                    <div className="intel-text" style={{ fontWeight: 600 }}>
                      {item.name}
                    </div>
                    <div className="intel-sub">
                      {t("intel.detail.actionCount", { count: item.action_count })}
                      {item.open_actions ? ` · ${t("intel.detail.openCount", { count: item.open_actions })}` : ""}
                    </div>
                  </div>
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="intel-detailcol">
        <div className="intel-detail-inner">
          {!sel ? (
            <div className="empty-state" style={{ paddingTop: 80 }}>
              <div className="empty-title">{t(`intel.detail.select.${section}`)}</div>
              <div className="empty-sub">{t("intel.detail.selectPrompt")}</div>
            </div>
          ) : section === "actions" ? (
            <>
              <div className="detail-head">
                <div className="detail-kicker">{t("intel.detail.kicker.actions")}</div>
                <div className="detail-title">{sel.action}</div>
              </div>
              <div className="meta-pills">
                {sel.owner && sel.owner !== "TBD" ? (
                  <button className="pill rec" style={{ cursor: "pointer" }} onClick={() => goToPerson(sel.owner)}>
                    {t("intel.detail.owner", { owner: sel.owner })}
                  </button>
                ) : (
                  <span className="pill">{t("intel.detail.ownerTbd")}</span>
                )}
                {sel.due && (
                  <span className="pill">
                    <ClockIcon size={11} /> {t("intel.detail.due", { due: sel.due })}
                  </span>
                )}
                <span className="pill">{sel.status === "done" ? t("intel.detail.done") : t("intel.detail.open")}</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn secondary" onClick={() => toggleDone(sel)}>
                  <CheckIcon size={13} />
                  {sel.status === "done" ? t("intel.detail.reopen") : t("intel.detail.markDone")}
                </button>
                <button className="source-link" style={{ marginTop: 0 }} onClick={() => goToMeeting(sel.meeting_id)}>
                  {sel.meeting_title} <ArrowIcon size={13} />
                </button>
              </div>
            </>
          ) : section === "decisions" ? (
            <>
              <div className="detail-head">
                <div className="detail-kicker">{t("intel.detail.kicker.decisions")}</div>
                <div className={`detail-title${isSuperseded(sel) ? " struck" : ""}`}>
                  {sel.text}
                </div>
              </div>
              <div className="meta-pills">
                {isSuperseded(sel) && <span className="pill">{t("intel.list.superseded")}</span>}
                <span className="pill">
                  <ClockIcon size={11} /> {fmtDate(sel.meeting_date)}
                </span>
              </div>
              <button className="source-link" onClick={() => goToMeeting(sel.meeting_id)}>
                {sel.meeting_title} <ArrowIcon size={13} />
              </button>
            </>
          ) : section === "topics" ? (
            <>
              <div className="detail-head">
                <div className="detail-kicker">{t("intel.detail.kicker.topics")}</div>
                <div className="detail-title">{sel.name}</div>
              </div>
              <div className="meta-pills">
                <span className="pill rec">{t("intel.detail.mentionCount", { count: sel.mentions })}</span>
                {sel.trend && <span className="pill">{TREND[sel.trend]} {t(`intel.trend.${sel.trend}`)}</span>}
              </div>
              <div className="section-card">
                <div className="section-label">{t("intel.detail.discussedIn")}</div>
                {(sel.meetings ?? []).map((mt, i) => (
                  <button key={i} className="related-row" onClick={() => goToMeeting(mt.id)}>
                    <span className="related-title">{mt.title}</span>
                    <span className="intel-sub">{fmtDate(mt.date)}</span>
                  </button>
                ))}
              </div>
              {relatedDecisions.length > 0 && (
                <div className="section-card">
                  <div className="section-label">{t("intel.detail.relatedDecisions")}</div>
                  {relatedDecisions.map((d, i) => (
                    <button key={i} className="related-row" onClick={() => goToMeeting(d.meeting_id)}>
                      <span className="related-title">{d.text}</span>
                      <span className="intel-sub">{fmtDate(d.meeting_date)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : section === "series" ? (
            <>
              <div className="detail-head">
                <div className="detail-kicker">{t("intel.detail.kicker.series")}</div>
                <div className="detail-title">{sel.name}</div>
              </div>
              <div className="meta-pills">
                <span className="pill rec">{t("intel.detail.meetingCount", { count: sel.count })}</span>
                {sel.cadence_days > 0 && <span className="pill">{t("intel.detail.series.cadenceDays", { cadence: sel.cadence_days })}</span>}
                {sel.completion_pct != null && (
                  <span className="pill">{t("intel.detail.series.completion", { pct: sel.completion_pct })}</span>
                )}
              </div>
              {nextExpected(sel) && (
                <div className="ai-meta-bar">
                  <span className="ai-meta-item">
                    {t("intel.detail.series.nextExpected", { date: nextExpected(sel) })}
                  </span>
                </div>
              )}
              {sel.open_actions + sel.done_actions > 0 && (
                <div className="ai-meta-bar">
                  <span className="ai-meta-item">
                    {t("intel.detail.series.openActions", { count: sel.open_actions })}
                  </span>
                  <span className="ai-meta-item">
                    {t("intel.detail.series.completedCount", { count: sel.done_actions })}
                  </span>
                </div>
              )}
              <div className="section-card">
                <div className="section-label">{t("intel.detail.series.carryOver")}</div>
                {carryOver.length === 0 ? (
                  <div className="section-body">{t("intel.detail.series.noCarryOver")}</div>
                ) : (
                  <ul>
                    {carryOver.map((c, i) => (
                      <li key={i}>
                        <strong>{c.action}</strong> — {t("intel.detail.series.stillOpen", { count: c.meetings.size })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {(sel.recurring_topics?.length ?? 0) > 0 && (
                <div className="section-card">
                  <div className="section-label">{t("intel.detail.series.recurringTopics")}</div>
                  <div className="section-body">
                    <ul>
                      {sel.recurring_topics.map((tp) => (
                        <li key={tp.name}>
                          <strong className="topic-chip">{tp.name}</strong> —{" "}
                          {t("intel.detail.series.cameUpIn", { count: tp.meetings, total: sel.count })}
                          {tp.meetings >= 3 ? ` ${t("intel.detail.series.noResolution")}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              <div className="section-card">
                <div className="section-label">{t("intel.detail.series.inSeries")}</div>
                {(sel.meetings ?? []).map((mt) => (
                  <button key={mt.id} className="related-row" onClick={() => goToMeeting(mt.id)}>
                    <span className="related-title">{mt.title}</span>
                    <span className="intel-sub">{fmtDate(mt.date)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : section === "conflicts" ? (
            <>
              <div className="detail-head">
                <div className="detail-kicker">{t("intel.detail.kicker.conflicts")}</div>
                <div className="detail-title">{sel.explanation || t("intel.detail.contradicting")}</div>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                <div className="section-card" style={{ flex: 1 }}>
                  <div className="section-label">{t("intel.detail.newDecision")}</div>
                  <div className="section-body">{sel.new_decision}</div>
                  <button className="source-link" onClick={() => goToMeeting(sel.new_meeting_id)}>
                    {sel.new_meeting_title} <ArrowIcon size={13} />
                  </button>
                </div>
                <div className="section-card" style={{ flex: 1 }}>
                  <div className="section-label">{t("intel.detail.priorDecision")}</div>
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
                <div className="detail-kicker">{t("intel.detail.kicker.people")}</div>
                <div className="detail-title">{sel.name}</div>
              </div>
              <div className="meta-pills">
                <span className="pill rec">{t("intel.detail.actionCount", { count: sel.action_count })}</span>
                {sel.open_actions > 0 && <span className="pill">{t("intel.detail.openCount", { count: sel.open_actions })}</span>}
                {sel.meeting_count > 0 && <span className="pill">{t("intel.detail.meetingCount", { count: sel.meeting_count })}</span>}
              </div>
              {(sel.recent_actions?.length ?? 0) > 0 && (
                <div className="section-card">
                  <div className="section-label">{t("intel.detail.recentActions")}</div>
                  {sel.recent_actions.map((a, i) => (
                    <div className="action-row" key={i}>
                      <span className="action-text">{a.action}</span>
                      {a.due && <span className="action-due">{a.due}</span>}
                      <button className="tool-btn" onClick={() => goToMeeting(a.meeting_id)}>
                        {t("intel.detail.view")}
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
                    <div className="section-label">{t("intel.detail.meetings")}</div>
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
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { openExternal } from "../api.js";
import { useStore, useLogo } from "../store.jsx";
import {
  CalendarIcon,
  CheckIcon,
  GavelIcon,
  GearIcon,
  MicIcon,
  MoonIcon,
  RefreshIcon,
  SeriesIcon,
  StopIcon,
  SunIcon,
  TagIcon,
  UsersIcon,
} from "./icons.jsx";

const NAV_ITEMS = [
  { key: "meetings", label: "Meetings", Icon: CalendarIcon },
  { key: "actions", label: "Actions", Icon: CheckIcon },
  { key: "decisions", label: "Decisions", Icon: GavelIcon },
  { key: "topics", label: "Topics", Icon: TagIcon },
  { key: "people", label: "People", Icon: UsersIcon },
  { key: "series", label: "Series", Icon: SeriesIcon },
];

function Waveform() {
  return (
    <span className="waveform" aria-hidden>
      <span /><span /><span /><span /><span /><span /><span /><span />
    </span>
  );
}

// Parse a calendar event start (ISO datetime, or date-only for all-day) to a Date.
function _meetingDate(start) {
  if (!start) return null;
  const d = start.length === 10 ? new Date(start + "T00:00:00") : new Date(start);
  return isNaN(d.getTime()) ? null : d;
}

function _dayLabel(d, now) {
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(d) - startOfDay(new Date(now))) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function _timeLabel(d) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function _countdown(d, now) {
  const mins = Math.round((d.getTime() - now) / 60000);
  if (mins <= 0) return "now";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

export default function Sidebar() {
  const {
    theme,
    setTheme,
    nav,
    setNav,
    recording,
    startRecording,
    stopRecording,
    license,
    myWork,
    refreshMyWork,
    upcoming,
    ready,
    setSettingsOpen,
    templates,
    selectedTemplate,
    setSelectedTemplate,
    activeCall,
    dismissActiveCall,
  } = useStore();
  const logoUrl = useLogo();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const isDarkish = theme === "dark";
  const nextEvent = upcoming.find((e) => !e.cancelled && !e.recorded_meeting_id);
  const free = license?.tier !== "pro";
  const used = license?.meetings_used ?? 0;
  const limit = license?.free_limit ?? 5;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <img className="logo-img" src={logoUrl} alt="" aria-hidden="true" />
          Aguacate
          {license && !free && <span className="brand-pill">Pro</span>}
        </div>
      </div>

      <div className="sidebar-scroll">
      <div className="status-box">
        <div className="status-row">
          <span className="status-label">
            <span className={`status-dot${recording.active ? " rec" : ""}`} />
            {recording.active ? "Recording" : "Ready"}
          </span>
        </div>
        {recording.active ? (
          <button className="record-btn recording" onClick={stopRecording}>
            <Waveform />
            Stop
            <StopIcon size={14} />
          </button>
        ) : (
          <>
            <button className="record-btn" data-tour="record-btn" onClick={() => startRecording()}>
              <span className="mic-pulse" style={{ display: "inline-flex" }}>
                <MicIcon size={16} />
              </span>
              Record
            </button>
            {templates.length > 0 && (
              <select
                className="template-select"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                title="Notes template for the next recording"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        {nextEvent ? (
          (() => {
            const d = _meetingDate(nextEvent.start);
            return (
              <div
                className="next-meeting-card"
                style={{
                  border: "1px solid rgba(63, 139, 69, 0.25)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "rgba(63, 139, 69, 0.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#3F8B45",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  <CalendarIcon size={12} /> Next meeting
                </div>
                <div style={{ fontWeight: 500, marginTop: 4, lineHeight: 1.3 }}>
                  {nextEvent.title}
                </div>
                {d && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      marginTop: 8,
                      paddingLeft: 8,
                      borderLeft: "3px solid #3F8B45",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#767b72" }}>
                      {_dayLabel(d, now)} · {_timeLabel(d)}
                    </span>
                    <span
                      style={{
                        background: "#3F8B45",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 999,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {_countdown(d, now)}
                    </span>
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <div className="calendar-hint">
            <CalendarIcon size={12} />
            <span className="hint-text">No upcoming meetings detected</span>
          </div>
        )}

        {activeCall && !recording.active && (
          <div className="call-detection-banner">
            <span className="call-detection-text">
              {activeCall.app} detected — record this call?
            </span>
            <div className="call-detection-actions">
              <button
                className="call-detection-btn primary"
                onClick={() => {
                  dismissActiveCall(activeCall.app);
                  startRecording({ title: `${activeCall.app} call` });
                }}
              >
                Record now
              </button>
              <button
                className="call-detection-btn"
                onClick={() => dismissActiveCall(activeCall.app)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {license && free && (
        <div className="plan-card free">
          <div className="plan-eyebrow">FREE PLAN</div>
          <div className="plan-usage">{used} of {limit} free meetings used</div>
          <div className="plan-unlock-label">Unlock with Pro:</div>
          <ul className="plan-features">
            <li><CheckIcon size={11} /> Unlimited meetings</li>
            <li><CheckIcon size={11} /> Cross-meeting intelligence</li>
            <li><CheckIcon size={11} /> All integrations</li>
          </ul>
          <button
            className="upgrade-cta"
            onClick={() => window.aguacate.openExternal("https://buy.stripe.com/cNieVf0mZ0iN7ml6AL6sw04")}
          >
            Upgrade to Pro — $20/mo
          </button>
        </div>
      )}

      {myWork && (
        <div className="mywork" data-tour="my-work">
          <div className="mywork-head">
            <div className="section-eyebrow">My Work</div>
            <button
              className="mywork-refresh"
              title="Refresh counts"
              aria-label="Refresh counts"
              onClick={() => refreshMyWork()}
            >
              <RefreshIcon size={13} />
            </button>
          </div>
          <button
            className="mywork-row clickable"
            onClick={() => setNav("actions")}
          >
            <span className="mywork-label">Open actions</span>
            <span className="mywork-badge">{myWork.open_actions}</span>
          </button>
          <button
            className="mywork-row clickable"
            onClick={() => setNav("decisions")}
          >
            <span className="mywork-label">Decisions this week</span>
            <span className="mywork-badge">{myWork.decisions_this_week}</span>
          </button>
          <button
            className="mywork-row clickable"
            onClick={() => setNav("meetings")}
          >
            <span className="mywork-label">Meetings processed</span>
            <span className="mywork-badge">{myWork.meetings_processed}</span>
          </button>
        </div>
      )}

      <nav className="nav" data-tour="nav-section">
        <div className="section-eyebrow">Navigate</div>
        {NAV_ITEMS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`nav-item${nav === key ? " active" : ""}`}
            onClick={() => setNav(key)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="online">
          <span className={`online-dot${ready ? "" : " off"}`} />
          {ready ? "Online" : "Starting"}
        </span>
        <div className="footer-actions">
          <button
            className="icon-btn"
            title="Toggle light/dark"
            onClick={() => setTheme(isDarkish ? "default" : "dark")}
          >
            {isDarkish ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            className="icon-btn"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon size={15} />
          </button>
        </div>
      </div>
      </div>
    </aside>
  );
}

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  WarnIcon,
} from "./icons.jsx";

const NAV_ITEMS = [
  { key: "meetings", Icon: CalendarIcon },
  { key: "actions", Icon: CheckIcon },
  { key: "decisions", Icon: GavelIcon },
  { key: "topics", Icon: TagIcon },
  { key: "people", Icon: UsersIcon },
  { key: "series", Icon: SeriesIcon },
  { key: "conflicts", Icon: WarnIcon },
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

function _dayLabel(d, now, t) {
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(d) - startOfDay(new Date(now))) / 86400000);
  if (days === 0) return t("sidebar.time.today");
  if (days === 1) return t("sidebar.time.tomorrow");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function _timeLabel(d) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function _countdown(d, now, t) {
  const mins = Math.round((d.getTime() - now) / 60000);
  if (mins <= 0) return t("sidebar.time.now");
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? t("sidebar.time.inHM", { h, m }) : t("sidebar.time.inM", { m });
}

export default function Sidebar() {
  const { t } = useTranslation();
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
          {license && !free && <span className="brand-pill">{t("sidebar.brand.pro")}</span>}
        </div>
      </div>

      <div className="sidebar-scroll">
      <div className="status-box">
        <div className="status-row">
          <span className="status-label">
            <span className={`status-dot${recording.active ? " rec" : ""}`} />
            {recording.active ? t("sidebar.status.recording") : t("sidebar.status.ready")}
          </span>
        </div>
        {recording.active ? (
          <button className="record-btn recording" onClick={stopRecording}>
            <Waveform />
            {t("sidebar.stop")}
            <StopIcon size={14} />
          </button>
        ) : (
          <>
            <button className="record-btn" data-tour="record-btn" onClick={() => startRecording()}>
              <span className="mic-pulse" style={{ display: "inline-flex" }}>
                <MicIcon size={16} />
              </span>
              {t("sidebar.record")}
            </button>
            {templates.length > 0 && (
              <select
                className="template-select"
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                title={t("sidebar.templateSelectTitle")}
              >
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
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
                  <CalendarIcon size={12} /> {t("sidebar.meetingCard.next")}
                </div>
                <div style={{ fontWeight: 500, marginTop: 2, lineHeight: 1.3 }}>
                  {nextEvent.title}
                </div>
                {d && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      marginTop: 6,
                      paddingLeft: 8,
                      borderLeft: "3px solid #3F8B45",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#767b72", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                      {_dayLabel(d, now, t)} · {_timeLabel(d)}
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
                        flexShrink: 0,
                      }}
                    >
                      {_countdown(d, now, t)}
                    </span>
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <div className="calendar-hint">
            <CalendarIcon size={12} />
            <span className="hint-text">{t("sidebar.meetingCard.none")}</span>
          </div>
        )}

        {activeCall && !recording.active && (
          <div className="call-detection-banner">
            <span className="call-detection-text">
              {t("sidebar.call.prompt", { app: activeCall.app })}
            </span>
            <div className="call-detection-actions">
              <button
                className="call-detection-btn primary"
                onClick={() => {
                  dismissActiveCall(activeCall.app);
                  startRecording({ title: t("sidebar.call.title", { app: activeCall.app }) });
                }}
              >
                {t("sidebar.call.record")}
              </button>
              <button
                className="call-detection-btn"
                onClick={() => dismissActiveCall(activeCall.app)}
              >
                {t("sidebar.call.dismiss")}
              </button>
            </div>
          </div>
        )}
      </div>

      {license && free && (
        <div className="plan-card free">
          <div className="plan-eyebrow">{t("sidebar.free.planLabel")}</div>
          <div className="plan-usage">{t("sidebar.free.usage", { used, limit })}</div>
          <div className="plan-unlock-label">{t("sidebar.free.unlock")}</div>
          <ul className="plan-features">
            <li><CheckIcon size={11} /> {t("sidebar.free.unlimited")}</li>
            <li><CheckIcon size={11} /> {t("sidebar.free.crossMeeting")}</li>
            <li><CheckIcon size={11} /> {t("sidebar.free.allIntegrations")}</li>
          </ul>
          <button
            className="upgrade-cta"
            onClick={() => window.aguacate.openExternal("https://buy.stripe.com/cNieVf0mZ0iN7ml6AL6sw04")}
          >
            {t("sidebar.free.upgrade")}
          </button>
        </div>
      )}

      {myWork && (
        <div className="mywork" data-tour="my-work">
          <div className="mywork-head">
            <div className="section-eyebrow">{t("sidebar.myWork.title")}</div>
            <button
              className="mywork-refresh"
              title={t("sidebar.myWork.refresh")}
              aria-label={t("sidebar.myWork.refresh")}
              onClick={() => refreshMyWork()}
            >
              <RefreshIcon size={13} />
            </button>
          </div>
          <button
            className="mywork-row clickable"
            onClick={() => setNav("actions")}
          >
            <span className="mywork-label">{t("sidebar.myWork.openActions")}</span>
            <span className="mywork-badge">{myWork.open_actions}</span>
          </button>
          <button
            className="mywork-row clickable"
            onClick={() => setNav("decisions")}
          >
            <span className="mywork-label">{t("sidebar.myWork.decisionsWeek")}</span>
            <span className="mywork-badge">{myWork.decisions_this_week}</span>
          </button>
          <button
            className="mywork-row clickable"
            onClick={() => setNav("meetings")}
          >
            <span className="mywork-label">{t("sidebar.myWork.meetingsProcessed")}</span>
            <span className="mywork-badge">{myWork.meetings_processed}</span>
          </button>
        </div>
      )}

      <nav className="nav" data-tour="nav-section">
        <div className="section-eyebrow">{t("sidebar.navigate")}</div>
        {NAV_ITEMS.map(({ key, Icon }) => (
          <button
            key={key}
            className={`nav-item${nav === key ? " active" : ""}`}
            onClick={() => setNav(key)}
          >
            <Icon size={15} />
            {t(`sidebar.nav.${key}`)}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="online">
          <span className={`online-dot${ready ? "" : " off"}`} />
          {ready ? t("sidebar.status.online") : t("sidebar.status.starting")}
        </span>
        <div className="footer-actions">
          <button
            className="icon-btn"
            title={t("sidebar.toggleTheme")}
            onClick={() => setTheme(isDarkish ? "default" : "dark")}
          >
            {isDarkish ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            className="icon-btn"
            title={t("sidebar.settings")}
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

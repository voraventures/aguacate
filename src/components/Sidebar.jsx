// Left rail — recreated from design-reference/AguacateChrome.dc.html: wordmark,
// Record button, the auto-record card, a minimal nav (Meetings/Digest), Settings,
// user chip. Nav is intentionally minimal per the design spec — Today/Library/
// Search/Meeting Zero were cut as redundant/undefined; search now lives in the
// meeting list's own search field instead of a nav destination. The "Record"
// row is the one deliberate addition the chrome mockup doesn't show (it has no
// in-app record trigger of its own) — it opens the capture-flow card in its
// idle phase, matching CaptureFlow.dc.html's own "Start recording" entry
// rather than starting the microphone immediately.
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { useStore, useLogo } from "../store.jsx";
import { ChevronDownIcon, DigestIcon, GearIcon, GridIcon, MicIcon } from "./icons.jsx";

const NAV_ITEMS = [
  { key: "meetings", Icon: GridIcon },
  { key: "digest", Icon: DigestIcon },
];

const AUTO_RECORD_LEAD_MIN = 60; // show the upcoming card once this close to start

function AutoRecordCard() {
  const { t } = useTranslation();
  const { upcoming } = useStore();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const next = useMemo(() => {
    return upcoming
      .filter((e) => !e.cancelled && !e.recorded_meeting_id && e.join_url)
      .map((e) => ({ ...e, minutesUntil: Math.round((new Date(e.start) - now) / 60000) }))
      .filter((e) => e.minutesUntil >= 0 && e.minutesUntil <= AUTO_RECORD_LEAD_MIN)
      .sort((a, b) => a.minutesUntil - b.minutesUntil)[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcoming, now]);

  if (!next) return null;

  return (
    <div className="auto-record-card" title={next.title}>
      <span className="auto-record-ring">
        <span className="auto-record-ring-num">{next.minutesUntil}</span>
        <span className="auto-record-ring-unit">{t("sidebar.autoRecord.min")}</span>
      </span>
      <span className="auto-record-main">
        <span className="auto-record-title">{next.title}</span>
        <span className="auto-record-sub">
          {t("sidebar.autoRecord.platformOn", { platform: next.platform })}
        </span>
      </span>
    </div>
  );
}

function initials(name) {
  return (
    (name || "")
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "A"
  );
}

export default function Sidebar() {
  const { t } = useTranslation();
  const {
    nav,
    setNav,
    recording,
    startRecording,
    captureOpen,
    setCaptureOpen,
    license,
    setSettingsOpen,
    activeCall,
    dismissActiveCall,
  } = useStore();
  const logoUrl = useLogo();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    api.get("/api/settings/user-name").then((r) => setUserName(r.user_name || "")).catch(() => {});
  }, []);

  const free = license?.tier !== "pro";

  return (
    <aside className="rail">
      <div className="rail-logo">
        <img className="logo-img" src={logoUrl} alt="" aria-hidden="true" />
        Aguacate
      </div>

      <nav className="rail-nav" data-tour="nav-section">
        <button
          className={`record-btn${recording.active || captureOpen ? " active" : ""}`}
          data-tour="record-btn"
          onClick={() => (recording.active ? null : setCaptureOpen(true))}
        >
          <MicIcon size={16} strokeWidth={1.9} />
          {t("sidebar.record")}
        </button>
        <AutoRecordCard />
        {NAV_ITEMS.map(({ key, Icon }) => (
          <button
            key={key}
            className={`nav-item${nav === key ? " active" : ""}`}
            onClick={() => setNav(key)}
          >
            <Icon size={17} />
            {t(`sidebar.nav.${key}`)}
          </button>
        ))}
      </nav>

      {activeCall && !recording.active && (
        <div className="call-banner">
          <span className="call-banner-text">
            {t("sidebar.call.prompt", { app: activeCall.app })}
          </span>
          <div className="call-banner-actions">
            <button
              className="call-banner-btn primary"
              onClick={() => {
                dismissActiveCall(activeCall.app);
                startRecording({ title: t("sidebar.call.title", { app: activeCall.app }) });
              }}
            >
              {t("sidebar.call.record")}
            </button>
            <button className="call-banner-btn" onClick={() => dismissActiveCall(activeCall.app)}>
              {t("sidebar.call.dismiss")}
            </button>
          </div>
        </div>
      )}

      <button className="nav-item rail-settings" onClick={() => setSettingsOpen(true)}>
        <GearIcon size={17} />
        {t("sidebar.settings")}
      </button>

      <button className="rail-account" onClick={() => setSettingsOpen(true)}>
        <span className="avatar rail-avatar">{initials(userName)}</span>
        <span className="rail-account-main">
          <span className="rail-account-name">{userName || t("sidebar.account.you")}</span>
          <span className="rail-account-plan">
            {free ? t("sidebar.account.upgrade") : t("sidebar.brand.pro")}
          </span>
        </span>
        <ChevronDownIcon size={14} className="rail-account-chevron" />
      </button>
    </aside>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { api, openExternal } from "../api.js";
import { THEMES, useStore } from "../store.jsx";
import { UsersIcon, XIcon } from "./icons.jsx";
import { BRAND_LOGOS } from "./brandLogos.jsx";

// Template glyphs (14px, stroke-based) — scoped to Settings only.
const TI = ({ size = 14, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);
const DocIcon = (p) => (
  <TI {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="13" y2="17" />
  </TI>
);
const ChartIcon = (p) => (
  <TI {...p}>
    <line x1="6" y1="20" x2="6" y2="12" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="18" y1="20" x2="18" y2="9" />
  </TI>
);
const BulbIcon = (p) => (
  <TI {...p}>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M15.1 14c.2-1 .7-1.7 1.4-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.8 1.2 1.5 1.4 2.5" />
  </TI>
);
const BuildingIcon = (p) => (
  <TI {...p}>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <path d="M9 22v-4h6v4" />
    <path d="M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
  </TI>
);
const UserCheckIcon = (p) => (
  <TI {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <polyline points="16 11 18 13 22 9" />
  </TI>
);
const SprintIcon = (p) => (
  <TI {...p}>
    <polygon points="5 3 19 12 5 21 5 3" />
  </TI>
);
const HeartIcon = (p) => (
  <TI {...p}>
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
  </TI>
);
const StarIcon = (p) => (
  <TI {...p}>
    <polygon points="12 2 15.1 8.6 22 9.3 17 14 18.2 21 12 17.6 5.8 21 7 14 2 9.3 8.9 8.6 12 2" />
  </TI>
);

// Builtin template id -> glyph. Custom templates fall back to the star.
const TEMPLATE_ICONS = {
  "builtin-default": DocIcon,
  "builtin-sales": ChartIcon,
  "builtin-oneonone": UsersIcon,
  "builtin-discovery": BulbIcon,
  "builtin-board": BuildingIcon,
  "builtin-interview": UserCheckIcon,
  "builtin-sprint": SprintIcon,
  "builtin-cs": HeartIcon,
};
const templateIcon = (t) => TEMPLATE_ICONS[t.id] || StarIcon;

// The shared tail sections every template is composed with (mirrors the
// backend's SHARED_TAIL) so chips reflect what's actually generated.
const TAIL_SECTIONS = ["Decisions Made", "Action Items", "Next Steps"];

// Derive the section chips from a template's markdown body (## headers),
// splicing in the shared tail wherever the {SHARED_TAIL} placeholder sits.
function templateSections(body) {
  if (!body) return [];
  const out = [];
  const parts = body.split("{SHARED_TAIL}");
  parts.forEach((part, i) => {
    for (const m of part.matchAll(/^##\s+(.+)$/gm)) out.push(m[1].trim());
    if (i < parts.length - 1) out.push(...TAIL_SECTIONS);
  });
  return out;
}

// Per-setting glyphs for the card layout (FIX 2) — scoped to Settings only.
const PaletteIcon = (p) => (
  <TI {...p}>
    <circle cx="13.5" cy="6.5" r="1.2" />
    <circle cx="17" cy="11" r="1.2" />
    <circle cx="8.5" cy="7" r="1.2" />
    <circle cx="6.5" cy="12.5" r="1.2" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.7-.4-1-.2-.2-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-4.4-4.5-8-10-8z" />
  </TI>
);
const TextSizeIcon = (p) => (
  <TI {...p}>
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </TI>
);
const ActivityIcon = (p) => (
  <TI {...p}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </TI>
);
const PowerIcon = (p) => (
  <TI {...p}>
    <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    <line x1="12" y1="2" x2="12" y2="12" />
  </TI>
);
const KeyboardIcon = (p) => (
  <TI {...p}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </TI>
);
const CalendarClockIcon = (p) => (
  <TI {...p}>
    <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <circle cx="17.5" cy="16.5" r="4" />
    <path d="M17.5 15v1.5l1 .8" />
  </TI>
);
const MicrophoneIcon = (p) => (
  <TI {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </TI>
);
const VolumeIcon = (p) => (
  <TI {...p}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
  </TI>
);
const CpuIcon = (p) => (
  <TI {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
  </TI>
);
const KeyIcon = (p) => (
  <TI {...p}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="M10.7 12.3 21 2M16 7l3 3M14 9l2 2" />
  </TI>
);
const ShieldIcon = (p) => (
  <TI {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </TI>
);
function RedactIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
const BanIcon = (p) => (
  <TI {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </TI>
);
const TrashIcon = (p) => (
  <TI {...p}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </TI>
);
const SpreadsheetIcon = (p) => (
  <TI {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M8 13h8M8 17h8M12 13v4" />
  </TI>
);
const FileTextIcon = (p) => (
  <TI {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="16" y2="17" />
    <line x1="8" y1="9" x2="10" y2="9" />
  </TI>
);
const LockIcon = (p) => (
  <TI {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </TI>
);
const CrownIcon = (p) => (
  <TI {...p}>
    <path d="M2 18h20M3 18l1.5-9 5 5 2.5-7 2.5 7 5-5L21 18" />
  </TI>
);
const CodeIcon = (p) => (
  <TI {...p}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </TI>
);
const RefreshIcon = (p) => (
  <TI {...p}>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </TI>
);
const CalendarIcon = (p) => (
  <TI {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </TI>
);

const THEME_PREVIEW = {
  default: ["#fbfaf6", "#3f8b45", "#1e281d"],
  dark: ["#131711", "#6fbf74", "#e8ecdf"],
  purple: ["#faf8fd", "#7445c4", "#271c38"],
  navy: ["#101726", "#5e9bdc", "#dde6f5"],
  warm: ["#fdf8f1", "#c0662b", "#38291a"],
  neon: ["#0a0e12", "#2fe08c", "#d8ffe9"],
};

const SECRET_FIELDS = [
  { name: "anthropic_api_key", label: "Anthropic API key", tab: "ai" },
  { name: "slack_webhook_url", label: "Slack webhook URL", tab: "integrations" },
  { name: "notion_token", label: "Notion integration token", tab: "integrations" },
  { name: "notion_database_id", label: "Notion database ID", tab: "integrations" },
  { name: "linear_api_key", label: "Linear API key", tab: "integrations" },
  { name: "jira_base_url", label: "Jira base URL", tab: "integrations" },
  { name: "jira_email", label: "Jira account email", tab: "integrations" },
  { name: "jira_token", label: "Jira API token", tab: "integrations" },
  { name: "hubspot_token", label: "HubSpot private app token", tab: "integrations" },
  { name: "salesforce_instance_url", label: "Salesforce instance URL", tab: "integrations" },
  { name: "salesforce_token", label: "Salesforce access token", tab: "integrations" },
  { name: "zapier_webhook_url", label: "Zapier webhook URL", tab: "integrations" },
];

const INTEGRATIONS = [
  { key: "slack", name: "Slack", desc: "Post a formatted meeting digest to a channel via incoming webhook.", fields: ["slack_webhook_url"] },
  { key: "notion", name: "Notion", desc: "Create a page with the full notes in any Notion database.", fields: ["notion_token", "notion_database_id"] },
  { key: "linear", name: "Linear", desc: "File the meeting notes as a Linear issue in your team.", fields: ["linear_api_key"] },
  { key: "jira", name: "Jira", desc: "Create a Jira task carrying the full notes.", fields: ["jira_base_url", "jira_email", "jira_token"] },
  { key: "hubspot", name: "HubSpot", desc: "Log the meeting as a note on your HubSpot CRM timeline.", fields: ["hubspot_token"] },
  { key: "salesforce", name: "Salesforce", desc: "Save the notes as a Salesforce Note object.", fields: ["salesforce_instance_url", "salesforce_token"] },
  { key: "google_drive", name: "Google Drive", desc: "Upload notes as Markdown. Uses your Google Calendar connection — no extra key.", fields: [], oauth: true },
  { key: "zapier", name: "Zapier", desc: "Send title + notes JSON to any Zap via catch-hook webhook.", fields: ["zapier_webhook_url"] },
];

const FIELD_LABELS = Object.fromEntries(SECRET_FIELDS.map((f) => [f.name, f.label]));

function SecretField({ name, label, isSet, onSaved }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const { showToast } = useStore();

  const save = () => {
    if (!value.trim()) return;
    setBusy(true);
    api
      .post("/api/secrets", { name, value: value.trim() })
      .then(() => {
        setValue("");
        showToast(`${label} saved to keychain`);
        onSaved();
      })
      .catch((e) => showToast(e.message, "error"))
      .finally(() => setBusy(false));
  };

  return (
    <div className="field">
      <label className="field-label">
        {label}{" "}
        {isSet && <span style={{ color: "var(--accent)", fontSize: 10.5 }}>● configured</span>}
      </label>
      <div style={{ display: "flex", gap: 7 }}>
        <input
          className="text-input"
          type="password"
          placeholder={isSet ? "••••••••  (saved in macOS Keychain)" : "Paste value"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <button className="btn" disabled={busy || !value.trim()} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

// Credential editor for the Integrations detail panel (FIX 1). Saves each
// field to the keychain via the existing /api/secrets endpoint; Disconnect
// clears them via the existing DELETE /api/secrets/{name} endpoint.
function IntegrationConfig({ ig, secrets, onSaved }) {
  const { showToast } = useStore();
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);

  const connected = ig.fields.length > 0 && ig.fields.every((f) => secrets[f]);

  const save = () => {
    const entries = ig.fields
      .map((f) => [f, (values[f] || "").trim()])
      .filter(([, v]) => v.length > 0);
    if (entries.length === 0) return;
    setBusy(true);
    Promise.all(entries.map(([name, value]) => api.post("/api/secrets", { name, value })))
      .then(() => {
        setValues({});
        showToast(`${ig.name} saved to keychain`);
        onSaved();
      })
      .catch((e) => showToast(e.message, "error"))
      .finally(() => setBusy(false));
  };

  const disconnect = () => {
    setBusy(true);
    Promise.all(ig.fields.map((name) => api.delete(`/api/secrets/${name}`)))
      .then(() => {
        showToast(`${ig.name} disconnected`);
        onSaved();
      })
      .catch((e) => showToast(e.message, "error"))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <div className="tpl-sections-label">Configuration</div>
      {ig.fields.map((f) => (
        <div className="ig-field" key={f}>
          <label className="ig-field-label">{FIELD_LABELS[f] || f}</label>
          <input
            className="text-input"
            type="password"
            placeholder={secrets[f] ? "••••••••  (saved in macOS Keychain)" : "Paste value"}
            value={values[f] || ""}
            onChange={(e) => setValues((s) => ({ ...s, [f]: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>
      ))}
      <button className="tpl-use-btn" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save"}
      </button>
      {connected && (
        <button className="ig-disconnect" disabled={busy} onClick={disconnect}>
          Disconnect
        </button>
      )}
    </>
  );
}

export default function Settings() {
  const {
    settingsOpen,
    setSettingsOpen,
    theme,
    setTheme,
    settings,
    setSettings,
    calendarStatus,
    refreshCalendar,
    license,
    refreshLicense,
    showToast,
    templates,
    refreshTemplates,
    setSelectedTemplate,
    workspace,
    refreshWorkspace,
  } = useStore();
  const [tab, setTab] = useState("appearance");
  const [tplDetailId, setTplDetailId] = useState(null);
  const [secrets, setSecrets] = useState({});
  const [devices, setDevices] = useState({ devices: [] });
  const [msFlow, setMsFlow] = useState(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null); // {id?,name,description,body}
  const [vaultPassword, setVaultPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [tabFade, setTabFade] = useState({ left: false, right: false });
  const [openIntegration, setOpenIntegration] = useState(null);
  const [setupModal, setSetupModal] = useState(null); // "google" | "microsoft" | null
  // Workspace state
  const [wsName, setWsName] = useState("");
  const [wsDisplayName, setWsDisplayName] = useState("");
  const [wsInviteCode, setWsInviteCode] = useState("");
  const [wsSharePath, setWsSharePath] = useState("");
  // Mobile state
  const [mobileSessions, setMobileSessions] = useState([]);
  const tabsRef = useRef(null);
  const isWin = (window.aguacate?.platform || "darwin") === "win32";

  const updateTabFade = () => {
    const el = tabsRef.current;
    if (!el) return;
    setTabFade({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  };

  const scrollTabs = (dir) => {
    tabsRef.current?.scrollBy({ left: dir * 180, behavior: "smooth" });
  };

  // keep the active tab fully visible
  useEffect(() => {
    if (!settingsOpen) return;
    const t = setTimeout(() => {
      tabsRef.current
        ?.querySelector(`[data-tab="${tab}"]`)
        ?.scrollIntoView({ inline: "nearest", block: "nearest" });
      updateTabFade();
    }, 30);
    return () => clearTimeout(t);
  }, [settingsOpen, tab]);

  const loadSecrets = () =>
    api.get("/api/integrations/status").then((r) => setSecrets(r.secrets)).catch(() => {});

  const loadMobileSessions = () =>
    api.get("/api/mobile/sessions").then(setMobileSessions).catch(() => {});

  useEffect(() => {
    if (settingsOpen) {
      loadSecrets();
      api.get("/api/recording/devices").then(setDevices).catch(() => {});
      refreshCalendar();
      loadMobileSessions();
      window.aguacate
        ?.getAutoLaunch?.()
        .then((r) => setAutoLaunch(!!r?.enabled))
        .catch(() => {});
      // Populate share path from current workspace state
      if (workspace?.workspace?.share_path) {
        setWsSharePath(workspace.workspace.share_path);
      }
    }
  }, [settingsOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAutoLaunch = () => {
    const next = !autoLaunch;
    setAutoLaunch(next);
    window.aguacate?.setAutoLaunch?.(next);
    api.post("/api/settings", { key: "auto_launch", value: next }).catch(() => {});
  };

  if (!settingsOpen) return null;

  const saveSetting = (key, value) => {
    setSettings((s) => ({ ...s, [key]: value }));
    api.post("/api/settings", { key, value }).catch((e) => showToast(e.message, "error"));
  };

  const connectGoogle = () => {
    api
      .post("/api/calendar/google/connect")
      .then(({ auth_url }) => openExternal(auth_url))
      .catch((e) => showToast(e.message, "error"));
  };

  const connectMicrosoft = () => {
    api
      .post("/api/calendar/microsoft/connect")
      .then((flow) => {
        setMsFlow(flow);
        openExternal(flow.verification_uri);
      })
      .catch((e) => showToast(e.message, "error"));
  };

  const activateLicense = () => {
    api
      .post("/api/license/activate", { license_key: licenseKey.trim() })
      .then(() => {
        setLicenseKey("");
        refreshLicense();
        showToast("License saved");
      })
      .catch((e) => showToast(e.message, "error"));
  };

  // DEV ONLY: flip the local license tier for testing; the sidebar re-reads
  // license state immediately via refreshLicense(). Backed by /api/dev/set-tier,
  // which is only registered when the backend runs in development.
  const switchTier = (tier) => {
    api
      .post("/api/dev/set-tier", { tier })
      .then(() => {
        refreshLicense();
        showToast(`Switched to ${tier === "pro" ? "Pro" : "Free"}`);
      })
      .catch((e) => showToast(e.message, "error"));
  };

  const TABS = [
    ["appearance", "Appearance"],
    ["recording", "Recording"],
    ["templates", "Templates"],
    ["ai", "AI"],
    ["calendars", "Calendars"],
    ["integrations", "Integrations"],
    ["privacy", "Privacy"],
    ["export", "Export"],
    ["workspace", "Workspace"],
    ["license", "License"],
  ];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSettingsOpen(false)}>
      <div className="modal" style={{ width: 760 }}>
        <div className="modal-header">
          <div className="modal-title">Settings</div>
          <button className="icon-btn" onClick={() => setSettingsOpen(false)}>
            <XIcon size={15} />
          </button>
        </div>
        <div className={`settings-tabs-wrap${tabFade.left ? " fade-left" : ""}${tabFade.right ? " fade-right" : ""}`}>
          {tabFade.left && (
            <button className="tab-arrow left" aria-label="Scroll tabs left" onClick={() => scrollTabs(-1)}>
              ‹
            </button>
          )}
          <div className="settings-tabs" ref={tabsRef} onScroll={updateTabFade}>
            {TABS.map(([key, label]) => (
              <button
                key={key}
                data-tab={key}
                className={`settings-tab${tab === key ? " active" : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {tabFade.right && (
            <button className="tab-arrow right" aria-label="Scroll tabs right" onClick={() => scrollTabs(1)}>
              ›
            </button>
          )}
        </div>
        <div className="modal-body">
          {tab === "appearance" && (
            <>
              <div className="set-section-label first">Appearance</div>
              <div className="set-card stack">
                <div className="set-card-icon"><PaletteIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Theme</div>
                  <div className="set-card-desc">Sets the color palette across the whole app.</div>
                </div>
                <div className="set-card-control">
                  <div className="theme-grid">
                    {THEMES.map((name) => (
                      <button
                        key={name}
                        className={`theme-swatch${theme === name ? " active" : ""}`}
                        onClick={() => setTheme(name)}
                      >
                        <span className="swatch-colors">
                          {THEME_PREVIEW[name].map((c) => (
                            <span key={c} className="swatch-dot" style={{ background: c }} />
                          ))}
                        </span>
                        <span className="swatch-name">
                          {name === "default" ? "Default" : name[0].toUpperCase() + name.slice(1)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="set-card">
                <div className="set-card-icon"><TextSizeIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Font size</div>
                  <div className="set-card-desc">Adjusts text size across the whole app. Medium is the default.</div>
                </div>
                <div className="set-card-control">
                  {(() => {
                    const fontSizes = ["small", "medium", "large"];
                    const fontLabels = ["Small", "Medium", "Large"];
                    const currentIndex = fontSizes.indexOf(settings.font_size || "medium");
                    return (
                      <div className="segmented seg-slider" style={{ position: "relative", maxWidth: 300 }}>
                        <div
                          className="seg-pill"
                          style={{
                            position: "absolute",
                            top: 3,
                            bottom: 3,
                            left: `calc(${currentIndex} * (100% / 3) + 3px)`,
                            width: "calc(100% / 3 - 6px)",
                            background: "var(--panel-solid)",
                            borderRadius: 6,
                            boxShadow: "var(--shadow-sm)",
                            transition: "left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                            pointerEvents: "none",
                            zIndex: 0,
                          }}
                        />
                        {fontLabels.map((label, i) => (
                          <button
                            key={fontSizes[i]}
                            onClick={() => saveSetting("font_size", fontSizes[i])}
                            style={{
                              flex: 1,
                              padding: "6px 0",
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 600,
                              color: currentIndex === i ? "var(--accent-text)" : "var(--muted)",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              position: "relative",
                              zIndex: 1,
                              transition: "color 0.25s ease",
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="set-card">
                <div className="set-card-icon"><ActivityIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Reduce motion</div>
                  <div className="set-card-desc">Disables animations and transitions.</div>
                </div>
                <div className="set-card-control">
                  <button
                    className={`btn${settings.reduce_motion ? "" : " secondary"}`}
                    onClick={() => saveSetting("reduce_motion", !settings.reduce_motion)}
                  >
                    {settings.reduce_motion ? "On" : "Off"}
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === "recording" && (
            <>
              <div className="set-section-label first">Startup</div>
              <div className="set-card">
                <div className="set-card-icon"><PowerIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Launch Aguacate at login</div>
                  <div className="set-card-desc">Never miss an auto-recorded meeting.</div>
                </div>
                <div className="set-card-control">
                  <button
                    className={`btn${autoLaunch ? "" : " secondary"}`}
                    onClick={toggleAutoLaunch}
                  >
                    {autoLaunch ? "On" : "Off"}
                  </button>
                </div>
              </div>
              <div className="set-card">
                <div className="set-card-icon"><KeyboardIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Global shortcut</div>
                  <div className="set-card-desc">
                    Start or stop recording from anywhere — even when Aguacate is in the tray.
                  </div>
                </div>
                <div className="set-card-control">
                  <strong>{isWin ? "Ctrl+Shift+R" : "⌘+Shift+R"}</strong>
                </div>
              </div>

              <div className="set-section-label">Capture</div>
              <div className="set-card">
                <div className="set-card-icon"><CalendarClockIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Auto-record mode</div>
                  <div className="set-card-desc">How Aguacate decides when to start recording.</div>
                </div>
                <div className="set-card-control">
                  <select
                    className="select-input"
                    value={settings.recording_mode || "confirm_30s"}
                    onChange={(e) => saveSetting("recording_mode", e.target.value)}
                  >
                    <option value="all">Record all meetings automatically</option>
                    <option value="confirm_30s">Ask me 30 seconds before each meeting</option>
                    <option value="manual">Manual only (show calendar, never prompt)</option>
                    <option value="off">Off</option>
                  </select>
                </div>
              </div>
              <div className="set-card">
                <div className="set-card-icon"><MicrophoneIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Microphone</div>
                  <div className="set-card-desc">Input device for your voice.</div>
                </div>
                <div className="set-card-control">
                  <select
                    className="select-input"
                    value={settings.mic_device ?? ""}
                    onChange={(e) =>
                      saveSetting("mic_device", e.target.value === "" ? null : Number(e.target.value))
                    }
                  >
                    <option value="">System default</option>
                    {devices.devices.map((d) => (
                      <option key={d.index} value={d.index}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="set-card stack">
                <div className="set-card-icon"><VolumeIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">System audio device</div>
                  <div className="set-card-desc">
                    {isWin
                      ? "Windows: pick the \"(loopback)\" entry matching your speakers — Aguacate taps system audio via WASAPI, no driver needed."
                      : "macOS: install BlackHole (free) and select it here to capture meeting audio from Zoom/Meet. Aguacate mixes it with your mic locally."}
                  </div>
                </div>
                <div className="set-card-control">
                  <select
                    className="select-input"
                    value={settings.system_device ?? ""}
                    onChange={(e) =>
                      saveSetting("system_device", e.target.value === "" ? null : Number(e.target.value))
                    }
                  >
                    <option value="">None</option>
                    {devices.devices.map((d) => (
                      <option key={d.index} value={d.index}>
                        {d.name}{d.is_loopback_like ? "  ← loopback" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="set-section-label">Transcription</div>
              <div className="set-card">
                <div className="set-card-icon"><CpuIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Whisper model</div>
                  <div className="set-card-desc">Transcription runs 100% on this Mac. Models download once on first use.</div>
                </div>
                <div className="set-card-control">
                  <select
                    className="select-input"
                    value={settings.whisper_model || "base"}
                    onChange={(e) => saveSetting("whisper_model", e.target.value)}
                  >
                    <option value="tiny">tiny — fastest</option>
                    <option value="base">base — balanced</option>
                    <option value="small">small — better accuracy</option>
                    <option value="medium">medium — high accuracy, slower</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {tab === "ai" && (
            <>
              <div className="set-section-label first">Model access</div>
              {SECRET_FIELDS.filter((f) => f.tab === "ai").map((f) => (
                <div className="set-card stack" key={f.name}>
                  <div className="set-card-icon"><KeyIcon size={14} /></div>
                  <SecretField {...f} isSet={secrets[f.name]} onSaved={loadSecrets} />
                </div>
              ))}
              <div className="set-card stack">
                <div className="set-card-icon"><StarIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Claude model</div>
                  <div className="set-card-desc">
                    Only the transcript text is sent to Claude to write your notes. Audio never leaves
                    this Mac. Your key is stored in the macOS Keychain.
                  </div>
                </div>
                <div className="set-card-control">
                  <select
                    className="select-input"
                    value={settings.claude_model || "claude-sonnet-4-6"}
                    onChange={(e) => saveSetting("claude_model", e.target.value)}
                  >
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (recommended)</option>
                    <option value="claude-opus-4-8">Claude Opus 4.8 (highest quality)</option>
                    <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (fastest)</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {tab === "calendars" && (
            <>
              <div className="set-section-label first">Connected calendars</div>
              <div className="set-card">
                <div className="set-card-icon cal-google" style={{ background: "rgba(66,133,244,0.08)" }}><div style={{ width: 14, height: 14, borderRadius: 3, background: "#4285F4", color: "white", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>G</div></div>
                <div className="set-card-main">
                  <div className="set-card-name">Google Calendar</div>
                  <div className="set-card-desc">
                    {calendarStatus.google ? "Connected." : "Connects via Google OAuth."}
                  </div>
                </div>
                <div className="set-card-control">
                  {calendarStatus.google ? (
                    <button
                      className="btn secondary"
                      onClick={() => api.post("/api/calendar/google/disconnect").then(refreshCalendar)}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      className="btn"
                      onClick={() =>
                        calendarStatus.google_configured ? connectGoogle() : setSetupModal("google")
                      }
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
              <div className="set-card">
                <div className="set-card-icon cal-microsoft" style={{ background: "rgba(0,120,212,0.08)" }}><div style={{ width: 14, height: 14, borderRadius: 3, background: "#0078D4", color: "white", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>M</div></div>
                <div className="set-card-main">
                  <div className="set-card-name">Microsoft Calendar</div>
                  <div className="set-card-desc">
                    {calendarStatus.microsoft ? "Connected." : "Connects via Microsoft OAuth."}
                  </div>
                </div>
                <div className="set-card-control">
                  {calendarStatus.microsoft ? (
                    <button
                      className="btn secondary"
                      onClick={() => api.post("/api/calendar/microsoft/disconnect").then(refreshCalendar)}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      className="btn"
                      onClick={() =>
                        calendarStatus.microsoft_configured
                          ? connectMicrosoft()
                          : setSetupModal("microsoft")
                      }
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
              {msFlow && (
                <div className="section-card" style={{ marginTop: 4 }}>
                  <div className="section-body">
                    <p>
                      Enter code <strong>{msFlow.user_code}</strong> at{" "}
                      {msFlow.verification_uri}
                    </p>
                  </div>
                </div>
              )}
              {!isWin && (
                <div className="set-card">
                  <div className="set-card-icon cal-apple" style={{ background: "rgba(0,0,0,0.06)" }}><div style={{ width: 14, height: 14, borderRadius: 3, background: "#555555", color: "white", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>A</div></div>
                  <div className="set-card-main">
                    <div className="set-card-name">Apple Calendar</div>
                    <div className="set-card-desc">
                      {calendarStatus.apple ? "Enabled (local)." : "Click to enable."}
                    </div>
                  </div>
                  <div className="set-card-control">
                    <button
                      className={`btn${calendarStatus.apple ? " secondary" : ""}`}
                      onClick={() =>
                        api
                          .post("/api/calendar/apple/toggle", { enabled: !calendarStatus.apple })
                          .then(refreshCalendar)
                      }
                    >
                      {calendarStatus.apple ? "Disable" : "Enable"}
                    </button>
                  </div>
                </div>
              )}
              <div className="field-help" style={{ marginTop: 10 }}>
                Aguacate polls connected calendars every 30 seconds and merges duplicate events
                across calendars automatically. macOS will ask for Calendar permission the first
                time Apple Calendar is enabled.
              </div>
            </>
          )}

          {tab === "integrations" && (() => {
            const igConnected = (ig) =>
              ig.oauth ? !!calendarStatus.google : ig.fields.every((f) => secrets[f]);
            const activeIg = INTEGRATIONS.find((i) => i.key === openIntegration) || INTEGRATIONS[0];
            const activeConnected = igConnected(activeIg);
            return (
              <div className="tpl-layout">
                <div className="tpl-sidebar">
                  {INTEGRATIONS.map((ig) => (
                    <button
                      key={ig.key}
                      className={`tpl-item${activeIg.key === ig.key ? " active" : ""}`}
                      onClick={() => setOpenIntegration(ig.key)}
                    >
                      <span className="tpl-item-icon ig-logo">{BRAND_LOGOS[ig.key]?.svg}</span>
                      <span className="tpl-item-label">{ig.name}</span>
                      {igConnected(ig) && <span className="ig-dot" />}
                    </button>
                  ))}
                </div>
                <div className="tpl-detail">
                  <div className="ig-detail-header">
                    <span
                      className="ig-detail-badge"
                      style={{
                        ...(BRAND_LOGOS[activeIg.key]?.tint && { background: BRAND_LOGOS[activeIg.key].tint }),
                        color: BRAND_LOGOS[activeIg.key]?.color,
                      }}
                    >
                      {BRAND_LOGOS[activeIg.key]?.svg}
                    </span>
                    <div className="ig-detail-title">{activeIg.name}</div>
                    <span className={`connect-state${activeConnected ? " on" : ""}`}>
                      {activeConnected ? "CONNECTED" : "NOT CONFIGURED"}
                    </span>
                  </div>
                  <div className="ig-detail-desc">{activeIg.desc}</div>
                  {activeIg.oauth ? (
                    activeConnected ? (
                      <div className="field-help">
                        Connected through your Google account. Manage it in the Calendars tab.
                      </div>
                    ) : (
                      <button className="btn" onClick={() => setTab("calendars")}>
                        Connect Google in Calendars →
                      </button>
                    )
                  ) : (
                    <IntegrationConfig ig={activeIg} secrets={secrets} onSaved={loadSecrets} />
                  )}
                </div>
              </div>
            );
          })()}

          {tab === "templates" && (
            <>
              {!editingTemplate ? (
                (() => {
                  const activeTpl = templates.find((t) => t.id === tplDetailId) || templates[0];
                  return (
                    <div className="tpl-layout">
                      <div className="tpl-sidebar">
                        {templates.map((t) => {
                          const Icon = templateIcon(t);
                          const active = activeTpl && t.id === activeTpl.id;
                          return (
                            <button
                              key={t.id}
                              className={`tpl-item${active ? " active" : ""}`}
                              onClick={() => setTplDetailId(t.id)}
                            >
                              <span className="tpl-item-icon"><Icon size={14} /></span>
                              <span className="tpl-item-label">{t.name}</span>
                            </button>
                          );
                        })}
                        <div className="tpl-divider" />
                        <button
                          className="tpl-item"
                          onClick={() =>
                            setEditingTemplate({
                              name: "",
                              description: "",
                              body: "## Executive Summary\n2-3 sentences.\n\n## My Section\nWhat to capture here. **Bold** key themes.\n\n{SHARED_TAIL}",
                            })
                          }
                        >
                          <span className="tpl-item-icon"><StarIcon size={14} /></span>
                          <span className="tpl-item-label">New template</span>
                        </button>
                      </div>
                      <div className="tpl-detail">
                        {activeTpl && (
                          <>
                            <div className="tpl-detail-header">
                              <div className="tpl-detail-title">
                                {activeTpl.name}
                                <span className={`tpl-badge ${activeTpl.builtin ? "builtin" : "custom"}`}>
                                  {activeTpl.builtin ? "BUILT-IN" : "CUSTOM"}
                                </span>
                              </div>
                              {activeTpl.description && (
                                <div className="tpl-detail-desc">{activeTpl.description}</div>
                              )}
                            </div>
                            <div className="tpl-sections-label">Sections generated</div>
                            <div className="tpl-chips">
                              {templateSections(activeTpl.body).map((s, i) => (
                                <span className="tpl-chip" key={i}>{s}</span>
                              ))}
                            </div>
                            <button
                              className="tpl-use-btn"
                              onClick={() => {
                                setSelectedTemplate(activeTpl.id);
                                showToast(`"${activeTpl.name}" set as your recording template`);
                              }}
                            >
                              Use this template
                            </button>
                            {!activeTpl.builtin && (
                              <div className="tpl-detail-actions">
                                <button className="btn secondary" onClick={() => setEditingTemplate(activeTpl)}>
                                  Edit
                                </button>
                                <button
                                  className="btn secondary"
                                  onClick={() =>
                                    api.delete(`/api/templates/${activeTpl.id}`).then(() => {
                                      setTplDetailId(null);
                                      refreshTemplates();
                                    })
                                  }
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <>
                  <div className="field">
                    <label className="field-label">Name</label>
                    <input
                      className="text-input"
                      value={editingTemplate.name}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">Description</label>
                    <input
                      className="text-input"
                      value={editingTemplate.description}
                      onChange={(e) =>
                        setEditingTemplate({ ...editingTemplate, description: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">Structure (markdown ## sections)</label>
                    <textarea
                      className="text-input"
                      style={{ minHeight: 220, resize: "vertical", fontSize: 11.5, lineHeight: 1.55 }}
                      value={editingTemplate.body}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                    />
                    <div className="field-help">
                      Write {"{SHARED_TAIL}"} where the standard Decisions / Action Items /
                      Next Steps block should go.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn"
                      disabled={!editingTemplate.name.trim() || editingTemplate.body.length < 10}
                      onClick={() => {
                        const payload = {
                          name: editingTemplate.name,
                          description: editingTemplate.description,
                          body: editingTemplate.body,
                        };
                        const req = editingTemplate.id
                          ? api.patch(`/api/templates/${editingTemplate.id}`, payload)
                          : api.post("/api/templates", payload);
                        req
                          .then(() => {
                            setEditingTemplate(null);
                            refreshTemplates();
                            showToast("Template saved");
                          })
                          .catch((e) => showToast(e.message, "error"));
                      }}
                    >
                      Save template
                    </button>
                    <button className="btn secondary" onClick={() => setEditingTemplate(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {tab === "privacy" && (
            <>
              <div className="set-section-label first">Privacy</div>
              <div className="set-card">
                <div className="set-card-icon"><ShieldIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Meeting Coach</div>
                  <div className="set-card-desc">Live analysis during recording — 100% local.</div>
                </div>
                <div className="set-card-control">
                  <button
                    className={`btn${settings.coach_enabled !== false ? "" : " secondary"}`}
                    onClick={() => saveSetting("coach_enabled", settings.coach_enabled === false)}
                  >
                    {settings.coach_enabled !== false ? "On" : "Off"}
                  </button>
                </div>
              </div>
              <div className="set-card stack">
                <div className="set-card-icon icon-redact"><RedactIcon /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Redacted words</div>
                  <div className="set-card-desc">
                    Auto-redacted{" "}
                    <span style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, display: "block" }}>
                      Redacted text appears as:
                    </span>
                    (█████) from transcripts — and therefore from notes,
                    search, and every export.
                  </div>
                </div>
                <div className="set-card-control">
                  <input
                    className="text-input"
                    placeholder="acme corp, project nova, jane (comma separated)"
                    defaultValue={(settings.redact_words || []).join(", ")}
                    onBlur={(e) =>
                      saveSetting(
                        "redact_words",
                        e.target.value.split(",").map((w) => w.trim()).filter(Boolean).slice(0, 100)
                      )
                    }
                  />
                </div>
              </div>
              <div className="set-card stack">
                <div className="set-card-icon"><BanIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Never record these meetings</div>
                  <div className="set-card-desc">
                    Calendar events matching these patterns are never prompted, briefed,
                    or auto-recorded.
                  </div>
                </div>
                <div className="set-card-control">
                  <input
                    className="text-input"
                    placeholder="1:1 with lawyer, therapy, comp review (title contains)"
                    defaultValue={(settings.exclude_patterns || []).join(", ")}
                    onBlur={(e) =>
                      saveSetting(
                        "exclude_patterns",
                        e.target.value.split(",").map((w) => w.trim()).filter(Boolean).slice(0, 100)
                      )
                    }
                  />
                </div>
              </div>
              <div className="set-card">
                <div className="set-card-icon"><TrashIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Auto-delete meetings after</div>
                  <div className="set-card-desc">Old meetings are removed automatically once they pass this age.</div>
                </div>
                <div className="set-card-control">
                  <select
                    className="select-input"
                    value={settings.retention_days || 0}
                    onChange={(e) => saveSetting("retention_days", Number(e.target.value))}
                  >
                    <option value={0}>Never (keep everything)</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={180}>180 days</option>
                    <option value={365}>1 year</option>
                  </select>
                </div>
              </div>
              <div className="field-help">
                During a recording you can also hit <strong>Mute zone</strong> in the
                Coach panel — silence is written instead of audio until you unmute.
              </div>
            </>
          )}

          {tab === "export" && (
            <>
              <div className="set-section-label first">Exports</div>
              <div className="set-card">
                <div className="set-card-icon"><SpreadsheetIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Action items CSV</div>
                  <div className="set-card-desc">Every action across all meetings.</div>
                </div>
                <div className="set-card-control">
                  <button
                    className="btn secondary"
                    onClick={() =>
                      api.post("/api/export/pack/actions_csv").then(({ path }) => {
                        showToast("CSV exported");
                        window.aguacate?.showInFolder?.(path);
                      }).catch((e) => showToast(e.message, "error"))
                    }
                  >
                    Export
                  </button>
                </div>
              </div>
              <div className="set-card">
                <div className="set-card-icon"><FileTextIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Decision timeline PDF</div>
                  <div className="set-card-desc">Chronological decision log.</div>
                </div>
                <div className="set-card-control">
                  <button
                    className="btn secondary"
                    onClick={() =>
                      api.post("/api/export/pack/timeline_pdf").then(({ path }) => {
                        showToast("Timeline exported");
                        window.aguacate?.showInFolder?.(path);
                      }).catch((e) => showToast(e.message, "error"))
                    }
                  >
                    Export
                  </button>
                </div>
              </div>

              <div className="set-section-label">Mobile</div>
              <div className="set-card stack">
                <div className="set-card-main">
                  <div className="set-card-name">Aguacate for iOS — coming soon</div>
                  <div className="set-card-desc">
                    The mobile companion app lets you review notes, complete actions, and search meetings on your iPhone.
                    Connected devices are listed below and can be revoked at any time.
                  </div>
                </div>
                <div className="set-card-control">
                  <button
                    className="btn secondary"
                    onClick={() => {
                      api
                        .post("/api/mobile/auth", { device_id: "manual-qr-" + Date.now(), device_name: "QR Setup Token" })
                        .then((r) => {
                          showToast("Mobile token: " + r.mobile_token.slice(0, 12) + "…  (copy from logs)");
                          loadMobileSessions();
                        })
                        .catch((e) => showToast(e.message, "error"));
                    }}
                  >
                    Connect mobile app
                  </button>
                </div>
              </div>
              {mobileSessions.length > 0 && (
                <div className="set-card stack">
                  <div className="set-card-main">
                    <div className="set-card-name">Connected devices</div>
                  </div>
                  <div className="set-card-control" style={{ flexDirection: "column", gap: 6, width: "100%" }}>
                    {mobileSessions.map((s) => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                        <span style={{ flex: 1 }}>{s.device_name || s.device_id}</span>
                        <span style={{ color: "var(--muted)", fontSize: 11 }}>{s.created_at?.slice(0, 10)}</span>
                        {!s.revoked && (
                          <button
                            className="btn secondary"
                            style={{ padding: "2px 8px", fontSize: 11 }}
                            onClick={() =>
                              api
                                .post(`/api/mobile/sessions/${s.id}/revoke`)
                                .then(() => { loadMobileSessions(); showToast("Device revoked"); })
                                .catch((e) => showToast(e.message, "error"))
                            }
                          >
                            Revoke
                          </button>
                        )}
                        {s.revoked && <span style={{ color: "var(--muted)", fontSize: 11 }}>Revoked</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="set-section-label">Backup</div>
              <div className="set-card stack">
                <div className="set-card-icon"><LockIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Encrypted Vault</div>
                  <div className="set-card-desc">
                    Your entire meeting corpus — notes, transcripts, database — as one
                    password-encrypted portable file. Only a local-first app can offer this.
                  </div>
                </div>
                <div className="set-card-control">
                  <div style={{ display: "flex", gap: 8, width: "100%" }}>
                    <input
                      className="text-input"
                      type="password"
                      placeholder="Vault password (min 8 chars)"
                      value={vaultPassword}
                      onChange={(e) => setVaultPassword(e.target.value)}
                    />
                    <button
                      className="btn"
                      disabled={vaultPassword.length < 8 || busy}
                      onClick={() => {
                        setBusy(true);
                        api
                          .post("/api/vault/export", { password: vaultPassword })
                          .then(({ path }) => {
                            setVaultPassword("");
                            showToast("Vault exported");
                            window.aguacate?.showInFolder?.(path);
                          })
                          .catch((e) => showToast(e.message, "error"))
                          .finally(() => setBusy(false));
                      }}
                    >
                      {busy ? "Encrypting…" : "Export vault"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "workspace" && (
            <>
              <div className="set-section-label first">Team Workspace</div>
              {!workspace?.workspace ? (
                <>
                  <div className="set-card stack">
                    <div className="set-card-main">
                      <div className="set-card-name">Create a workspace</div>
                      <div className="set-card-desc">Start a team space to share meetings with teammates.</div>
                    </div>
                    <div className="set-card-control" style={{ flexDirection: "column", gap: 6 }}>
                      <input
                        className="text-input"
                        placeholder="Workspace name"
                        value={wsName}
                        onChange={(e) => setWsName(e.target.value)}
                      />
                      <input
                        className="text-input"
                        placeholder="Your display name"
                        value={wsDisplayName}
                        onChange={(e) => setWsDisplayName(e.target.value)}
                      />
                      <button
                        className="btn"
                        disabled={!wsName.trim() || busy}
                        onClick={() => {
                          setBusy(true);
                          api
                            .post("/api/workspace/create", { name: wsName.trim(), display_name: wsDisplayName.trim() })
                            .then(() => {
                              refreshWorkspace();
                              setWsName("");
                              showToast("Workspace created");
                            })
                            .catch((e) => showToast(e.message, "error"))
                            .finally(() => setBusy(false));
                        }}
                      >
                        Create workspace
                      </button>
                    </div>
                  </div>
                  <div className="set-card stack">
                    <div className="set-card-main">
                      <div className="set-card-name">Join a workspace</div>
                      <div className="set-card-desc">Enter an invite code from a teammate.</div>
                    </div>
                    <div className="set-card-control" style={{ flexDirection: "column", gap: 6 }}>
                      <input
                        className="text-input"
                        placeholder="Invite code (e.g. AB12CD34)"
                        value={wsInviteCode}
                        onChange={(e) => setWsInviteCode(e.target.value.toUpperCase())}
                      />
                      <input
                        className="text-input"
                        placeholder="Your display name"
                        value={wsDisplayName}
                        onChange={(e) => setWsDisplayName(e.target.value)}
                      />
                      <button
                        className="btn"
                        disabled={wsInviteCode.length < 6 || busy}
                        onClick={() => {
                          setBusy(true);
                          api
                            .post("/api/workspace/join", { invite_code: wsInviteCode, display_name: wsDisplayName.trim() })
                            .then(() => {
                              refreshWorkspace();
                              setWsInviteCode("");
                              showToast("Joined workspace");
                            })
                            .catch((e) => showToast(e.message, "error"))
                            .finally(() => setBusy(false));
                        }}
                      >
                        Join workspace
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="set-card">
                    <div className="set-card-main">
                      <div className="set-card-name">{workspace.workspace.name}</div>
                      <div className="set-card-desc">
                        Invite code: <strong>{workspace.workspace.invite_code}</strong>
                        {" · "}
                        {workspace.members?.length ?? 0} member{workspace.members?.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="set-card-control">
                      <button
                        className="btn secondary"
                        onClick={() => {
                          setBusy(true);
                          api
                            .post("/api/workspace/leave")
                            .then(() => { refreshWorkspace(); showToast("Left workspace"); })
                            .catch((e) => showToast(e.message, "error"))
                            .finally(() => setBusy(false));
                        }}
                      >
                        Leave
                      </button>
                    </div>
                  </div>
                  {workspace.members && workspace.members.length > 0 && (
                    <div className="set-card stack">
                      <div className="set-card-main">
                        <div className="set-card-name">Members</div>
                      </div>
                      <div className="set-card-control" style={{ flexDirection: "column", gap: 4 }}>
                        {workspace.members.map((m, i) => (
                          <div key={i} style={{ fontSize: 12.5 }}>
                            {m.display_name || "Member"}{" "}
                            <span style={{ color: "var(--muted)", fontSize: 11 }}>joined {m.joined_at?.slice(0, 10)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="set-section-label">Sync folder</div>
                  <div className="set-card stack">
                    <div className="set-card-main">
                      <div className="set-card-name">Shared folder path</div>
                      <div className="set-card-desc">
                        Point to a shared network drive or Dropbox folder that all members can access.
                        Aguacate writes meeting JSON files here when you share to team.
                      </div>
                    </div>
                    <div className="set-card-control" style={{ flexDirection: "column", gap: 6 }}>
                      <input
                        className="text-input"
                        placeholder="/Volumes/SharedDrive  or  ~/Dropbox/team"
                        value={wsSharePath}
                        onChange={(e) => setWsSharePath(e.target.value)}
                      />
                      <button
                        className="btn"
                        disabled={!wsSharePath.trim()}
                        onClick={() => {
                          api
                            .post("/api/workspace/share-path", { path: wsSharePath.trim() })
                            .then(() => { refreshWorkspace(); showToast("Sync path saved"); })
                            .catch((e) => showToast(e.message, "error"));
                        }}
                      >
                        Save path
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {tab === "license" && (
            <>
              <div className="set-section-label first">Subscription</div>
              <div className="set-card">
                <div className="set-card-icon"><CrownIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Current plan</div>
                  {license?.tier !== "pro" && (
                    <div className="set-card-desc">
                      {license?.remaining ?? 5} of {license?.free_limit ?? 5} free meetings remaining.
                    </div>
                  )}
                </div>
                <div className="set-card-control">
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                    {license?.plan_name || (license?.tier === "pro" ? "Pro" : "Free")}
                  </span>
                </div>
              </div>
              <div className="set-card stack">
                <div className="set-card-icon"><KeyIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">License key</div>
                  <div className="set-card-desc">Paste your Aguacate Pro key to activate.</div>
                </div>
                <div className="set-card-control">
                  <div style={{ display: "flex", gap: 7, width: "100%" }}>
                    <input
                      className="text-input"
                      placeholder={license?.license_key_set ? "•••••••• (saved)" : "AGUA-XXXX-XXXX-XXXX"}
                      value={licenseKey}
                      onChange={(e) => setLicenseKey(e.target.value)}
                    />
                    <button className="btn" disabled={licenseKey.trim().length < 8} onClick={activateLicense}>
                      Activate
                    </button>
                  </div>
                </div>
              </div>
              <div className="set-card">
                <div className="set-card-icon"><RefreshIcon size={14} /></div>
                <div className="set-card-main">
                  <div className="set-card-name">Manage subscription</div>
                  <div className="set-card-desc">Re-check your license or upgrade to Pro.</div>
                </div>
                <div className="set-card-control">
                  <button className="btn secondary" onClick={() => api.post("/api/license/refresh").then(refreshLicense)}>
                    Re-validate
                  </button>
                  <button className="btn" onClick={() => openExternal("https://aguacatenotes.com/pricing")}>
                    Get Pro — $20/mo
                  </button>
                </div>
              </div>
              {/* DEV ONLY: tier switching for local testing (hidden in production builds) */}
              {import.meta.env.DEV && (
                <div className="dev-testing">
                  <div className="dev-testing-label">
                    <CodeIcon size={11} /> Developer Testing
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="dev-tier-btn" onClick={() => switchTier("free")}>
                      Switch to Free
                    </button>
                    <button className="dev-tier-btn" onClick={() => switchTier("pro")}>
                      Switch to Pro
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {setupModal && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 70 }}
          onMouseDown={(e) => e.target === e.currentTarget && setSetupModal(null)}
        >
          <div className="modal" style={{ width: 460 }}>
            <div className="modal-header">
              <div className="modal-title">
                Connect {setupModal === "google" ? "Google" : "Microsoft"} Calendar
              </div>
              <button className="icon-btn" onClick={() => setSetupModal(null)}>
                <XIcon size={15} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, lineHeight: 1.65, marginBottom: 12 }}>
                Aguacate connects to your calendar with{" "}
                {setupModal === "google" ? "Google's" : "Microsoft's"} official sign-in
                (OAuth) — you approve access in your browser and your password is never
                shared with Aguacate.
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.65, marginBottom: 12, color: "var(--muted)" }}>
                One quick one-time setup is needed first: Aguacate has to be registered
                as an app in your {setupModal === "google" ? "Google" : "Microsoft"}{" "}
                account so it's allowed to ask for calendar access. The guide below
                walks you through it in about two minutes — then come back here and
                hit Connect again.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button
                  className="btn"
                  onClick={() =>
                    openExternal(
                      setupModal === "google"
                        ? "https://docs.aguacatenotes.com/setup/google-calendar"
                        : "https://docs.aguacatenotes.com/setup/microsoft-calendar"
                    )
                  }
                >
                  Learn more
                </button>
                <button className="btn secondary" onClick={() => setSetupModal(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

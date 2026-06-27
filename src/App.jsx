import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore, useLogo } from "./store.jsx";
import i18n from "./i18n.js";
import BriefPanel from "./components/BriefPanel.jsx";
import CoachPanel from "./components/CoachPanel.jsx";
import IntelligenceView from "./components/IntelligenceView.jsx";
import MeetingList from "./components/MeetingList.jsx";
import NotesPanel from "./components/NotesPanel.jsx";
import OnboardingTour from "./components/OnboardingTour.jsx";
import RecordPrompt from "./components/RecordPrompt.jsx";
import Settings from "./components/Settings.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Titlebar from "./components/Titlebar.jsx";

const platform = window.aguacate?.platform || "darwin";
const MIN_LIST = 240;
const MAX_LIST = 480;

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("[Aguacate] Render error caught by ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="boot">
          <div className="logo">
            <img className="logo-img" src={this.props.logoUrl} alt="" aria-hidden="true" /> Aguacate
          </div>
          <h2 style={{ margin: "16px 0 4px", fontSize: 18, fontWeight: 600, color: "var(--text)" }}>
            {i18n.t("app.error.title")}
          </h2>
          <div className="boot-sub">{i18n.t("app.error.restartHint")}</div>
          <button className="btn" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
            {i18n.t("app.error.restart")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { t } = useTranslation();
  const { ready, connectionFailed, nav, toast } = useStore();
  const logoUrl = useLogo();
  const [listWidth, setListWidth] = useState(() => {
    const saved = Number(localStorage.getItem("aguacate_list_width"));
    return saved >= MIN_LIST && saved <= MAX_LIST ? saved : 308;
  });
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("aguacate_list_collapsed") === "1"
  );
  const [dragging, setDragging] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const dragRef = useRef(null);

  // Start the interactive tour once the app is ready and the welcome onboarding
  // has been completed (separate "aguacate_tour_done" flag so the tour and the
  // welcome screen never fight over a single flag).
  useEffect(() => {
    if (!ready) return undefined;
    if (localStorage.getItem("aguacate_tour_done") === "true") return undefined;
    const tryStart = () => {
      if (localStorage.getItem("aguacate_onboarded") === "true") {
        setTourActive(true);
        return true;
      }
      return false;
    };
    if (tryStart()) return undefined;
    const id = setInterval(() => {
      if (tryStart()) clearInterval(id);
    }, 400);
    return () => clearInterval(id);
  }, [ready]);

  const onDragStart = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(true);
      const startX = e.clientX;
      const startW = listWidth;
      const onMove = (ev) => {
        const w = Math.min(MAX_LIST, Math.max(MIN_LIST, startW + ev.clientX - startX));
        setListWidth(w);
      };
      const onUp = (ev) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setDragging(false);
        const w = Math.min(MAX_LIST, Math.max(MIN_LIST, startW + ev.clientX - startX));
        localStorage.setItem("aguacate_list_width", String(w));
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [listWidth]
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      localStorage.setItem("aguacate_list_collapsed", c ? "0" : "1");
      return !c;
    });
  }, []);

  if (connectionFailed) {
    return (
      <div className="boot">
        <div className="logo">
          <img className="logo-img" src={logoUrl} alt="" aria-hidden="true" /> Aguacate
        </div>
        <div className="boot-sub">
          {t("app.engine.unreachable")}
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="boot">
        <div className="logo">
          <img className="logo-img" src={logoUrl} alt="" aria-hidden="true" /> Aguacate
        </div>
        <div className="processing-ring" />
        <div className="boot-sub">{t("app.engine.starting")}</div>
      </div>
    );
  }

  const showList = nav === "meetings" && !collapsed;
  const columns =
    nav === "meetings"
      ? collapsed
        ? "240px 28px 1fr"
        : `240px ${listWidth}px 1fr`
      : `240px ${Math.max(listWidth, 320)}px 1fr`;

  return (
    <ErrorBoundary logoUrl={logoUrl}>
      {platform === "win32" && <Titlebar />}
      <div
        className={`app ${platform}`}
        style={{ gridTemplateColumns: columns }}
      >
        <Sidebar />
        {nav === "meetings" ? (
          <>
            {showList ? (
              <MeetingList onCollapse={toggleCollapsed}>
                <div
                  className={`resize-handle${dragging ? " dragging" : ""}`}
                  ref={dragRef}
                  onMouseDown={onDragStart}
                  title={t("app.dragResize")}
                />
              </MeetingList>
            ) : (
              <div className="expand-rail">
                <button
                  className="collapse-btn"
                  title={t("app.expandList")}
                  aria-label={t("app.expandMeetingList")}
                  onClick={toggleCollapsed}
                >
                  ›
                </button>
              </div>
            )}
            <NotesPanel />
          </>
        ) : (
          <IntelligenceView />
        )}
        <Settings />
        <RecordPrompt />
        <CoachPanel />
        <BriefPanel />
        {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}
      </div>
      {tourActive && <OnboardingTour onComplete={() => setTourActive(false)} />}
    </ErrorBoundary>
  );
}

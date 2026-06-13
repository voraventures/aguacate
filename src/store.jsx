// Global app state: data fetching, websocket events, theme persistence.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, connectWebSocket, initBackend } from "./api.js";

const StoreContext = createContext(null);

export const THEMES = ["default", "dark", "purple", "navy", "warm", "neon"];

export function StoreProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [health, setHealth] = useState({});
  const [theme, setThemeState] = useState(
    () => localStorage.getItem("aguacate_theme") || "default"
  );
  const [nav, setNav] = useState("meetings"); // meetings|actions|decisions|topics|people
  const [meetings, setMeetings] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [meetingDetail, setMeetingDetail] = useState(null);
  const [license, setLicense] = useState(null);
  const [myWork, setMyWork] = useState(null);
  const [recording, setRecording] = useState({ active: false, meetingId: null });
  const [recordingLevel, setRecordingLevel] = useState(0);
  const [calendarStatus, setCalendarStatus] = useState({});
  const [upcoming, setUpcoming] = useState([]);
  const [prompt, setPrompt] = useState(null); // auto-record prompt payload
  const [settings, setSettings] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progress, setProgress] = useState({}); // meeting_id -> {stage, pct}
  const [toast, setToast] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("builtin-default");
  const [coachData, setCoachData] = useState(null);
  const [coachOpen, setCoachOpen] = useState(true);
  const [brief, setBrief] = useState(null); // pre-meeting intelligence payload
  const [muted, setMuted] = useState(false);
  const [markerCount, setMarkerCount] = useState(0);
  const [liveTranscriptChunks, setLiveTranscriptChunks] = useState([]);
  const [activeCall, setActiveCall] = useState(null); // { app, process, detected_at }
  const [workspace, setWorkspace] = useState(null);
  const selectedIdRef = useRef(null);
  selectedIdRef.current = selectedId;

  const notify = useCallback((title, body) => {
    window.aguacate?.notify?.(title, body || "");
  }, []);

  const showToast = useCallback((message, kind = "info") => {
    setToast({ message, kind, at: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.at >= 3800 ? null : t)), 4000);
  }, []);

  const setTheme = useCallback((name) => {
    setThemeState(name);
    localStorage.setItem("aguacate_theme", name);
    document.documentElement.dataset.theme = name;
    api.post("/api/settings", { key: "theme", value: name }).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Appearance preferences: font size + reduce motion
  useEffect(() => {
    const sizes = { small: "13px", medium: "14px", large: "15px" };
    document.documentElement.style.setProperty(
      "--font-size-base",
      sizes[settings.font_size] || sizes.medium
    );
    document.body.classList.toggle("reduce-motion", !!settings.reduce_motion);
  }, [settings.font_size, settings.reduce_motion]);

  const refreshMeetings = useCallback(
    () => api.get("/api/meetings").then(setMeetings).catch(() => {}),
    []
  );
  const refreshLicense = useCallback(
    () => api.get("/api/license/status").then(setLicense).catch(() => {}),
    []
  );
  const refreshMyWork = useCallback(
    () => api.get("/api/intelligence/my-work").then(setMyWork).catch(() => {}),
    []
  );
  const refreshCalendar = useCallback(() => {
    api.get("/api/calendar/status").then(setCalendarStatus).catch(() => {});
    api.get("/api/calendar/upcoming").then(setUpcoming).catch(() => {});
  }, []);
  const refreshTemplates = useCallback(
    () => api.get("/api/templates").then(setTemplates).catch(() => {}),
    []
  );

  const selectMeeting = useCallback((id) => {
    setSelectedId(id);
    setMeetingDetail(null);
    if (id) {
      api.get(`/api/meetings/${id}`).then(setMeetingDetail).catch(() => {});
    }
  }, []);

  const refreshDetail = useCallback(() => {
    const id = selectedIdRef.current;
    if (id) api.get(`/api/meetings/${id}`).then(setMeetingDetail).catch(() => {});
  }, []);

  const deleteMeeting = useCallback(
    (id) =>
      api
        .delete(`/api/meetings/${id}`)
        .then(() => {
          if (selectedIdRef.current === id) selectMeeting(null);
          return refreshMeetings();
        })
        .catch((err) => showToast(err.message, "error")),
    [refreshMeetings, selectMeeting, showToast]
  );

  // ---------- boot ----------
  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const info = await initBackend();
      if (!info) {
        setConnectionFailed(true);
        return;
      }
      // wait for backend to accept requests
      for (let i = 0; i < 60; i++) {
        try {
          const h = await api.get("/api/health");
          setHealth(h);
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      await Promise.all([
        refreshMeetings(),
        refreshLicense(),
        refreshMyWork(),
        refreshCalendar(),
        api.get("/api/settings").then((s) => {
          setSettings(s);
          if (s.default_template) setSelectedTemplate(s.default_template);
        }).catch(() => {}),
        refreshTemplates(),
        api
          .get("/api/recording/status")
          .then((s) => setRecording({ active: s.recording, meetingId: s.meeting_id }))
          .catch(() => {}),
      ]);
      setReady(true);

      cleanup = connectWebSocket((event, data) => {
        switch (event) {
          case "recording_started":
            setRecording({ active: true, meetingId: data.meeting_id });
            setCoachData(null);
            setMuted(false);
            setMarkerCount(0);
            setLiveTranscriptChunks([]);
            refreshMeetings();
            notify("Recording started", "Aguacate is capturing this meeting locally.");
            break;
          case "transcript_chunk":
            if (data.text) {
              setLiveTranscriptChunks((prev) => [...prev, data.text]);
            }
            break;
          case "coach_update":
            setCoachData(data);
            break;
          case "recording_muted":
            setMuted(!!data.muted);
            break;
          case "marker_added":
            setMarkerCount(data.count || 0);
            break;
          case "meeting_brief":
            setBrief(data);
            notify(
              "Meeting brief ready",
              `${data.title} starts in ${data.minutes_until} min — you have history with this group.`
            );
            break;
          case "daily_pulse":
            notify(
              "Action Pulse",
              `${data.stale_count} stale action${data.stale_count === 1 ? "" : "s"} need attention.`
            );
            break;
          case "conflicts_found":
            notify("Conflict detected", "A new decision contradicts an earlier one.");
            if (selectedIdRef.current === data.meeting_id) refreshDetail();
            break;
          case "transcription_done":
            notify("Transcription complete", "Claude is writing your notes now.");
            break;
          case "recording_stopped":
            setRecording({ active: false, meetingId: null });
            setRecordingLevel(0);
            setLiveTranscriptChunks([]);
            break;
          case "recording_level":
            setRecordingLevel(data.rms || 0);
            break;
          case "meeting_status":
            setProgress((p) => ({
              ...p,
              [data.meeting_id]: { stage: data.status, pct: null },
            }));
            refreshMeetings();
            if (data.status === "ready" || data.status === "error") {
              refreshMyWork();
              refreshLicense();
              if (selectedIdRef.current === data.meeting_id) refreshDetail();
              if (data.status === "error") showToast(data.error || "Processing failed", "error");
              if (data.status === "ready")
                notify("Notes ready", "Your meeting notes and action items are ready to review.");
            }
            break;
          case "transcription_progress":
            setProgress((p) => ({
              ...p,
              [data.meeting_id]: { stage: "transcribing", pct: data.progress },
            }));
            break;
          case "meeting_prompt":
          case "auto_record_starting":
            setPrompt({ ...data, auto: event === "auto_record_starting" });
            notify("Meeting detected", `${data.title || "A meeting"} is about to start.`);
            break;
          case "calendar_synced":
            api.get("/api/calendar/upcoming").then(setUpcoming).catch(() => {});
            break;
          case "google_connected":
          case "ms_connected":
            refreshCalendar();
            showToast("Calendar connected");
            break;
          case "ms_connect_failed":
            showToast("Microsoft sign-in failed", "error");
            break;
          default:
            break;
        }
      });
    })();
    return () => cleanup();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTemplateRef = useRef(selectedTemplate);
  selectedTemplateRef.current = selectedTemplate;

  const startRecording = useCallback(
    async (opts = {}) => {
      try {
        const result = await api.post("/api/recording/start", {
          title: opts.title || "",
          calendar_event_id: opts.calendarEventId || null,
          template_id: opts.templateId || selectedTemplateRef.current || null,
        });
        setRecording({ active: true, meetingId: result.meeting_id });
        await refreshMeetings();
        selectMeeting(result.meeting_id);
        return result;
      } catch (err) {
        showToast(err.message, "error");
        throw err;
      }
    },
    [refreshMeetings, selectMeeting, showToast]
  );

  const stopRecording = useCallback(async () => {
    try {
      await api.post("/api/recording/stop");
      setRecording({ active: false, meetingId: null });
      setRecordingLevel(0);
      await refreshMeetings();
    } catch (err) {
      showToast(err.message, "error");
    }
  }, [refreshMeetings, showToast]);

  // Global shortcuts forwarded from the main process
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  useEffect(() => {
    const off = window.aguacate?.onShortcut?.((name) => {
      if (name === "toggle-record") {
        if (recordingRef.current.active) stopRecording();
        else startRecording().catch(() => {});
      } else if (name === "ambient-start") {
        if (!recordingRef.current.active) startRecording().catch(() => {});
      } else if (name === "drop-marker") {
        if (recordingRef.current.active) {
          api.post("/api/recording/marker").catch(() => {});
        }
      }
    });
    return typeof off === "function" ? off : undefined;
  }, [startRecording, stopRecording]);

  // Keep the tray pulse in sync with recording state
  useEffect(() => {
    window.aguacate?.setRecordingState?.(recording.active);
  }, [recording.active]);

  // Feature 3: poll for active video-call apps every 30 seconds
  const activeCallDismissed = useRef(new Set());
  useEffect(() => {
    if (!ready) return;
    const poll = async () => {
      try {
        const r = await api.get("/api/system/active-calls");
        const calls = r.active_calls || [];
        const newCall = calls.find((c) => !activeCallDismissed.current.has(c.app));
        setActiveCall(newCall || null);
      } catch {
        // ignore — backend may not support yet
      }
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [ready]);

  const dismissActiveCall = useCallback((appName) => {
    activeCallDismissed.current.add(appName);
    setActiveCall(null);
  }, []);

  // Feature 4: load workspace on boot
  const refreshWorkspace = useCallback(
    () => api.get("/api/workspace").then((r) => setWorkspace(r)).catch(() => {}),
    []
  );

  useEffect(() => {
    if (ready) refreshWorkspace();
  }, [ready, refreshWorkspace]);

  const toggleMute = useCallback(async () => {
    try {
      const r = await api.post("/api/recording/mute", { muted: !muted });
      setMuted(r.muted);
    } catch (err) {
      showToast(err.message, "error");
    }
  }, [muted, showToast]);

  const dropMarker = useCallback(async () => {
    try {
      await api.post("/api/recording/marker");
      showToast("Moment flagged");
    } catch (err) {
      showToast(err.message, "error");
    }
  }, [showToast]);

  const value = {
    ready,
    connectionFailed,
    health,
    theme,
    setTheme,
    nav,
    setNav,
    meetings,
    refreshMeetings,
    selectedId,
    selectMeeting,
    meetingDetail,
    refreshDetail,
    deleteMeeting,
    license,
    refreshLicense,
    myWork,
    refreshMyWork,
    recording,
    recordingLevel,
    startRecording,
    stopRecording,
    calendarStatus,
    refreshCalendar,
    upcoming,
    prompt,
    setPrompt,
    settings,
    setSettings,
    settingsOpen,
    setSettingsOpen,
    progress,
    toast,
    showToast,
    templates,
    refreshTemplates,
    selectedTemplate,
    setSelectedTemplate,
    coachData,
    coachOpen,
    setCoachOpen,
    brief,
    setBrief,
    muted,
    toggleMute,
    markerCount,
    dropMarker,
    liveTranscriptChunks,
    activeCall,
    dismissActiveCall,
    workspace,
    refreshWorkspace,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  return useContext(StoreContext);
}

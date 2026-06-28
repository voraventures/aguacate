import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, showInFolder } from "../api.js";
import { useStore } from "../store.jsx";
import FollowUp from "./FollowUp.jsx";
import Markdown from "./Markdown.jsx";
import Onboarding from "./Onboarding.jsx";
import LiveTranscript from "./LiveTranscript.jsx";
import {
  CheckIcon,
  ClockIcon,
  ExportIcon,
  GavelIcon,
  MicIcon,
  RefreshIcon,
  SendIcon,
  SparkIcon,
  TagIcon,
  UsersIcon,
  WarnIcon,
} from "./icons.jsx";
import { EmptyNotes } from "./illustrations.jsx";

const INTEGRATION_LABELS = {
  slack: "Slack",
  notion: "Notion",
  linear: "Linear",
  jira: "Jira",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  google_drive: "Google Drive",
  zapier: "Zapier",
};

// Sections handled by dedicated components, not the generic renderer.
const SPECIAL_SECTIONS = new Set(["Action Items", "Decisions Made"]);
const SECTION_ICONS = {
  "Executive Summary": SparkIcon,
  "Compliance Flags": WarnIcon,
  "Flagged Moments": TagIcon,
};

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="empty-state" data-tour="notes-panel">
      <div className="empty-art">
        <EmptyNotes />
      </div>
      <div className="empty-title">{t('notes.empty.selectMeeting')}</div>
      <div className="empty-sub">{t('notes.empty.selectMeetingSub')}</div>
    </div>
  );
}

function ProcessingState({ stage, pct }) {
  const { t } = useTranslation();
  const labels = {
    recording: t('notes.processing.recording'),
    transcribing: pct
      ? t('notes.processing.transcribingPct', { pct: Math.round(pct * 100) })
      : t('notes.processing.transcribing'),
    generating: t('notes.processing.writing'),
  };
  return (
    <div className="processing-state">
      <div className="processing-ring" />
      <div style={{ fontSize: 12 }}>
        {labels[stage] || t('notes.processing.processing')}
      </div>
      <div style={{ fontSize: 11.5 }}>{t('notes.processing.audioLocal')}</div>
    </div>
  );
}

function ActionRow({ item, onAssign, onComplete }) {
  const { t } = useTranslation();
  const [assigning, setAssigning] = useState(false);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const isTbd = !item.owner || item.owner.trim().toUpperCase() === "TBD";

  const copy = () => {
    navigator.clipboard
      .writeText(`${item.owner}: ${item.action}${item.due ? ` (due ${item.due})` : ""}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  };

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onAssign(item.id, trimmed);
    setAssigning(false);
    setName("");
  };

  const done = item.status === "done";

  return (
    <div className={`action-row${done ? " completed" : ""}`}>
      <span className={`owner-chip${isTbd ? " tbd" : ""}`}>
        {isTbd ? t('notes.action.tbd') : item.owner}
      </span>
      <span className={`action-text${done ? " done" : ""}`}>
        {item.action}
      </span>
      {item.due && <span className="action-due">{item.due}</span>}
      <span className="action-tools">
        {assigning ? (
          <input
            className="assign-input"
            autoFocus
            placeholder={t('notes.action.owner')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAssigning(false);
            }}
            onBlur={submit}
          />
        ) : (
          <button className="tool-btn" onClick={() => setAssigning(true)}>
            {t('notes.action.assign')}
          </button>
        )}
        <button className="tool-btn" onClick={copy}>
          {copied ? t('notes.action.copied') : t('notes.action.copy')}
        </button>
        <button
          className={`tool-btn${done ? " done" : ""}`}
          onClick={() => onComplete(item)}
          title={done ? t('notes.action.markIncomplete') : t('notes.action.markComplete')}
        >
          {done ? (
            <>
              <CheckIcon size={12} /> {t('notes.action.done')}
            </>
          ) : (
            t('notes.action.complete')
          )}
        </button>
      </span>
    </div>
  );
}

function ConflictCard({ conflict, onResolve }) {
  const { t } = useTranslation();
  return (
    <div className="conflict-card">
      <div className="section-label" style={{ color: "var(--danger)" }}>
        <WarnIcon size={13} /> {t('notes.conflict.detected')}
      </div>
      <div className="conflict-pair">
        <div className="conflict-side new">
          <span className="conflict-tag">{t('notes.conflict.new')}</span>
          <p>{conflict.new_decision}</p>
        </div>
        <div className="conflict-side old">
          <span className="conflict-tag">
            {conflict.old_date?.slice(0, 10)} · {conflict.old_meeting_title}
          </span>
          <p>{conflict.old_decision}</p>
        </div>
      </div>
      {conflict.explanation && (
        <p className="conflict-why">{conflict.explanation}</p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => onResolve(conflict.id, "superseded")}>
          {t('notes.conflict.supersedes')}
        </button>
        <button className="btn secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => onResolve(conflict.id, "reviewed")}>
          {t('notes.conflict.markReviewed')}
        </button>
      </div>
    </div>
  );
}

function CoachRecap({ coach }) {
  const { t } = useTranslation();
  if (!coach || !coach.elapsed_sec) return null;
  return (
    <div className="ai-meta-bar" style={{ marginTop: 12 }}>
      <span className="ai-meta-item">
        <strong>{Math.round((coach.talk_density || 0) * 100)}%</strong> {t('notes.coach.speakingDensity')}
      </span>
      <span className="ai-meta-item">
        <strong>{coach.questions}</strong> {t('notes.coach.questions')}
      </span>
      <span className="ai-meta-item">
        <strong>{coach.fillers}</strong> {t('notes.coach.fillers')}
      </span>
      <span className="ai-meta-item">
        <strong>{coach.long_silences}</strong> {t('notes.coach.longSilences')}
      </span>
    </div>
  );
}

function SpeakerBadge({ speaker }) {
  const n = parseInt(speaker?.replace("Speaker ", ""), 10) || 1;
  const colors = ["var(--accent)", "var(--muted)", "#7b68ee", "#e8923c", "#2fb88b"];
  return (
    <span
      className="speaker-badge"
      style={{ background: colors[(n - 1) % colors.length] }}
    >
      S{n}
    </span>
  );
}

function TranscriptView({ segments }) {
  const { t } = useTranslation();
  if (!segments || segments.length === 0) {
    return <p style={{ color: "var(--muted)", fontSize: 12 }}>{t('notes.transcript.none')}</p>;
  }
  const hasSpeakers = segments.some((s) => s.speaker);
  if (!hasSpeakers) {
    return (
      <p style={{ fontSize: 12.5, lineHeight: 1.65 }}>
        {segments.map((s) => s.text).join(" ")}
      </p>
    );
  }
  // Group consecutive segments by speaker
  const groups = [];
  for (const seg of segments) {
    const last = groups[groups.length - 1];
    if (last && last.speaker === seg.speaker) {
      last.texts.push(seg.text);
    } else {
      groups.push({ speaker: seg.speaker || "Speaker 1", texts: [seg.text] });
    }
  }
  return (
    <div className="diarized-transcript">
      {groups.map((g, i) => (
        <div key={i} className="diarized-turn">
          <SpeakerBadge speaker={g.speaker} />
          <span className="diarized-text">{g.texts.join(" ")}</span>
        </div>
      ))}
    </div>
  );
}

// Sections that get scattered SVG accents.
const FIG_SECTIONS = new Set(["Executive Summary", "Action Items", "Key Decisions", "Key Discussions", "Next Steps"]);

// Decorative blob/circle figures positioned absolute inside a styled card.
function CardFigures({ section }) {
  if (!FIG_SECTIONS.has(section)) return null;
  const className = `card-fig card-fig-${section.toLowerCase().replace(/\s+/g, "-")}`;
  if (section === "Executive Summary") {
    return (
      <svg className={className} viewBox="0 0 420 320" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
        <path d="M218 -28 C250 -46 288 -24 288 10 C288 39 322 32 337 58 C354 88 326 123 292 112 C260 102 259 77 232 75 C196 73 185 -10 218 -28 Z" fill="#FF6B6B" opacity="0.72"/>
        <path d="M321 118 C349 93 384 112 377 143 C371 171 337 184 315 166 C293 148 296 140 321 118 Z" fill="#FFD93D" opacity="0.66"/>
        <circle cx="388" cy="50" r="15" fill="#4D96FF" opacity="0.70"/>
        <circle cx="378" cy="215" r="18" fill="#20C997" opacity="0.62"/>
        <circle cx="320" cy="272" r="34" fill="#CC5DE8" opacity="0.60"/>
        <path d="M300 274 C318 248 360 251 374 280 C388 309 358 332 330 323 C302 314 283 300 300 274 Z" fill="#FF922B" opacity="0.60"/>
      </svg>
    );
  }
  if (section === "Action Items") {
    return (
      <svg className={className} viewBox="0 0 420 320" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">
        <path d="M238 -16 C268 -41 310 -18 306 21 C303 50 346 43 355 78 C365 116 322 137 294 113 C270 92 276 66 245 63 C209 59 208 10 238 -16 Z" fill="#6BCB77" opacity="0.64"/>
        <path d="M345 174 C373 152 405 169 405 201 C405 233 370 252 343 232 C317 213 316 196 345 174 Z" fill="#4D96FF" opacity="0.60"/>
        <circle cx="309" cy="103" r="10" fill="#FF922B" opacity="0.72"/>
        <circle cx="294" cy="250" r="14" fill="#CC5DE8" opacity="0.68"/>
        <path d="M356 46 C386 26 419 47 417 82 C415 112 376 121 354 99 C332 78 329 64 356 46 Z" fill="#FFD93D" opacity="0.60"/>
      </svg>
    );
  }
  if (section === "Key Decisions") {
    return (
      <svg className={className} viewBox="0 0 420 320" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
        <path d="M232 -36 C268 -64 326 -42 325 13 C324 56 284 73 249 58 C215 43 202 -12 232 -36 Z" fill="#20C997" opacity="0.66"/>
        <circle cx="362" cy="48" r="14" fill="#FF6B6B" opacity="0.74"/>
        <circle cx="311" cy="66" r="10" fill="#FFD93D" opacity="0.62"/>
        <path d="M361 124 C383 104 412 116 411 143 C410 169 378 188 357 171 C335 154 337 145 361 124 Z" fill="#CC5DE8" opacity="0.60"/>
        <circle cx="279" cy="259" r="15" fill="#4D96FF" opacity="0.70"/>
        <circle cx="347" cy="244" r="11" fill="#FF922B" opacity="0.76"/>
        <path d="M365 214 C401 197 438 224 428 262 C418 300 372 307 349 278 C326 249 332 230 365 214 Z" fill="#6BCB77" opacity="0.60"/>
      </svg>
    );
  }
  if (section === "Key Discussions") {
    return (
      <svg className={className} viewBox="0 0 420 320" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
        <circle cx="350" cy="56" r="50" fill="#4D96FF" opacity="0.70"/>
        <circle cx="392" cy="36" r="28" fill="#FFD93D" opacity="0.72"/>
        <circle cx="310" cy="26" r="14" fill="#CC5DE8" opacity="0.68"/>
        <circle cx="354" cy="266" r="28" fill="#20C997" opacity="0.65"/>
        <circle cx="394" cy="236" r="13" fill="#FF6B6B" opacity="0.70"/>
      </svg>
    );
  }
  if (section === "Next Steps") {
    return (
      <svg className={className} viewBox="0 0 420 320" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
        <circle cx="352" cy="56" r="50" fill="#FF922B" opacity="0.70"/>
        <circle cx="394" cy="36" r="28" fill="#6BCB77" opacity="0.68"/>
        <circle cx="312" cy="26" r="14" fill="#4D96FF" opacity="0.65"/>
        <circle cx="354" cy="266" r="28" fill="#FFD93D" opacity="0.68"/>
        <circle cx="394" cy="236" r="13" fill="#CC5DE8" opacity="0.70"/>
      </svg>
    );
  }
  return null;
}

export default function NotesPanel() {
  const { t } = useTranslation();
  const {
    selectedId,
    meetingDetail,
    refreshDetail,
    refreshMeetings,
    refreshMyWork,
    progress,
    showToast,
    selectMeeting,
    deleteMeeting,
    templates,
    meetings,
    recording,
  } = useStore();
  const [title, setTitle] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [coachVisible, setCoachVisible] = useState(false);
  const [shareModal, setShareModal] = useState(null); // { url }
  const [notesTab, setNotesTab] = useState("notes"); // notes | transcript
  const [myItemsOnly, setMyItemsOnly] = useState(false);
  const [userName, setUserName] = useState("");
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem("aguacate_onboarded") === "true"
  );
  const titleRef = useRef(null);
  const moreRef = useRef(null);

  useEffect(() => {
    setTitle(meetingDetail?.title || "");
    setSendOpen(false);
    setRegenOpen(false);
    setMoreOpen(false);
    setFollowUpOpen(false);
    setCoachVisible(false);
    setNotesTab("notes");
  }, [meetingDetail?.id]);

  useEffect(() => {
    api.get("/api/settings/user-name").then((r) => setUserName(r.user_name || "")).catch(() => {});
  }, []);

  // Close the overflow menu when clicking outside it.
  useEffect(() => {
    if (!moreOpen) return;
    const onDocMouseDown = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [moreOpen]);

  const deleteFromNotes = () => {
    setMoreOpen(false);
    if (window.confirm(t('notes.confirm.delete'))) {
      deleteMeeting(meetingDetail.id);
    }
  };

  if (!onboarded) {
    return <Onboarding onDone={() => setOnboarded(true)} />;
  }
  if (!selectedId) {
    return <EmptyState />;
  }
  if (!meetingDetail)
    return (
      <div className="detail-panel">
        <div className="processing-state" style={{ paddingTop: 120 }}>
          <div className="processing-ring" />
        </div>
      </div>
    );

  const m = meetingDetail;
  const live = progress[m.id]?.stage || m.status;
  const intel = m.intelligence || {};
  const actions = intel.actions || [];
  const decisions = intel.decisions || [];
  const participants = intel.participants || [];
  const headsUp = intel.heads_up || [];
  const related = intel.related || [];
  const conflicts = (m.conflicts || []).filter((c) => c.status === "open");
  const sections = m.notes?.sections || {};
  const executiveSummary = sections["Executive Summary"] || "";
  const sectionEntries = Object.entries(sections).filter(
    ([name, body]) => !SPECIAL_SECTIONS.has(name) && name !== "Executive Summary" && body?.trim()
  );
  const showMetaBar =
    actions.length > 0 || decisions.length > 0 || participants.length > 0;

  const saveTitle = () => {
    const t = title.trim();
    if (t && t !== m.title) {
      api
        .patch(`/api/meetings/${m.id}`, { title: t })
        .then(() => {
          refreshMeetings();
          refreshDetail();
        })
        .catch((e) => showToast(e.message, "error"));
    } else {
      setTitle(m.title);
    }
  };

  const assign = (actionId, owner) => {
    api
      .patch(`/api/intelligence/actions/${actionId}`, { owner })
      .then(() => {
        refreshDetail();
        refreshMyWork();
      })
      .catch((e) => showToast(e.message, "error"));
  };

  const completeAction = (item) => {
    const next = item.status === "done" ? "open" : "done";
    api
      .patch(`/api/intelligence/actions/${item.id}`, {
        status: next,
        completed_at: next === "done" ? new Date().toISOString() : null,
      })
      .then(() => {
        refreshDetail();
        refreshMyWork();
      })
      .catch((e) => showToast(e.message, "error"));
  };

  const shareMeeting = () => {
    setMoreOpen(false);
    api
      .post(`/api/meetings/${m.id}/share`)
      .then((r) => setShareModal({ url: r.share_url }))
      .catch((e) => showToast(e.message, "error"));
  };

  const copyShareLink = () => {
    if (!shareModal) return;
    const text = shareModal.url;
    const ok = () => showToast(t('notes.toast.linkCopied'));
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(() => fallbackCopy(text, ok));
    } else {
      fallbackCopy(text, ok);
    }
  };

  function fallbackCopy(text, cb) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
      cb();
    } catch {
      showToast(t('notes.toast.copyFailed'), "error");
    }
    document.body.removeChild(ta);
  }

  const resolveConflict = (conflictId, resolution) => {
    api
      .patch(`/api/intelligence/conflicts/${conflictId}`, { resolution })
      .then(() => {
        refreshDetail();
        showToast(resolution === "superseded" ? t('notes.toast.oldSuperseded') : t('notes.toast.markedReviewed'));
      })
      .catch((e) => showToast(e.message, "error"));
  };

  const doExport = (fmt) => {
    api
      .post(`/api/export/${m.id}/${fmt}`)
      .then(({ path }) => {
        showToast(t('notes.toast.exported', { fmt: fmt.toUpperCase() }));
        showInFolder(path);
      })
      .catch((e) => showToast(e.message, "error"));
  };

  const copySlackDigest = () => {
    api
      .get(`/api/export/${m.id}/slack`)
      .then(({ text }) =>
        navigator.clipboard.writeText(text).then(() => showToast(t('notes.toast.slackCopied')))
      )
      .catch((e) => showToast(e.message, "error"));
  };

  const downloadMyActions = () => {
    api
      .post(`/api/export/${m.id}/my-actions`)
      .then(({ path }) => {
        showToast(t('notes.toast.exportedActions'));
        showInFolder(path);
      })
      .catch((e) => showToast(e.message, "error"));
  };

  const sendTo = (provider) => {
    setSendOpen(false);
    showToast(t('notes.toast.sendingTo', { label: INTEGRATION_LABELS[provider] }));
    api
      .post(`/api/integrations/${provider}/send/${m.id}`)
      .then((r) => showToast(r.message))
      .catch((e) => showToast(e.message, "error"));
  };

  const regenerateWith = (templateId) => {
    setRegenOpen(false);
    api
      .post(`/api/meetings/${m.id}/regenerate`, { template_id: templateId })
      .then(() => showToast(t('notes.toast.regenerating')))
      .catch((e) => showToast(e.message, "error"));
  };

  const fmtDate = new Date(m.started_at).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const templateName = templates.find((t) => t.id === m.template_id)?.name;

  return (
    <div className="detail-panel">
      <div className="detail-inner" data-tour="notes-panel">
        <input
          ref={titleRef}
          className="notes-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === "Enter" && titleRef.current?.blur()}
          spellCheck={false}
        />

        <div className="meta-pills">
          {m.audio_path && (
            <span className="pill rec">
              <MicIcon size={11} /> {t('notes.header.recorded')}
            </span>
          )}
          <span className="pill">
            <ClockIcon size={11} /> {fmtDate}
          </span>
          {participants.length > 0 && (
            <span className="pill">
              <UsersIcon size={11} /> {t('notes.header.attendee', { count: participants.length })}
            </span>
          )}
          {templateName && templateName !== "Default" && (
            <span className="pill">
              <TagIcon size={11} /> {templateName}
            </span>
          )}
          {!!m.followup_sent && (
            <span className="pill rec">
              <SendIcon size={11} /> {t('notes.header.followupSent')}
            </span>
          )}
          <div className="notes-header-menu" ref={moreRef}>
            <button
              className="notes-header-menu-btn"
              aria-label={t('notes.header.moreOptions')}
              onClick={() => setMoreOpen(!moreOpen)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
            {moreOpen && (
              <div className="card-menu-dropdown" role="menu">
                <button className="menu-item" onClick={shareMeeting}>
                  {t('notes.header.shareMeeting')}
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMoreOpen(false);
                    api
                      .post(`/api/meetings/${m.id}/share-to-workspace`)
                      .then(() => showToast(t('notes.toast.sharedTeam')))
                      .catch((e) => showToast(e.message, "error"));
                  }}
                >
                  {t('notes.header.shareTeam')}
                </button>
                <button className="delete-menu-item" onClick={deleteFromNotes}>
                  {t('notes.header.deleteMeeting')}
                </button>
              </div>
            )}
          </div>
        </div>

        {live === "recording" && recording.active && recording.meetingId === m.id ? (
          <LiveTranscript startedAt={m.started_at} />
        ) : ["recording", "transcribing", "generating"].includes(live) ? (
          <ProcessingState stage={live} pct={progress[m.id]?.pct} />
        ) : live === "error" ? (
          <div className="section-card warning">
            <div className="section-label">
              <WarnIcon size={13} /> {t('notes.error.processingFailed')}
            </div>
            <div className="section-body">
              <p>{m.error || t('notes.error.processingFailedSub')}</p>
            </div>
            <button
              className="toolbar-btn"
              style={{ marginTop: 12 }}
              onClick={() => regenerateWith(null)}
            >
              <RefreshIcon size={13} /> {t('notes.error.retry')}
            </button>
          </div>
        ) : !m.notes ? (
          <div className="processing-state">
            <div style={{ fontSize: 13 }}>{t('notes.error.noNotes')}</div>
          </div>
        ) : (
          <>
            {/* Tab switcher: Notes | Transcript */}
            {m.transcript && (
              <div className="notes-tab-bar">
                <button
                  className={`notes-tab-btn${notesTab === "notes" ? " active" : ""}`}
                  onClick={() => setNotesTab("notes")}
                >
                  {t('notes.tab.notes')}
                </button>
                <button
                  className={`notes-tab-btn${notesTab === "transcript" ? " active" : ""}`}
                  onClick={() => setNotesTab("transcript")}
                >
                  {t('notes.tab.transcript')}
                </button>
                {m.workspace_id && (
                  <span className="workspace-shared-badge">{t('notes.tab.shared')}</span>
                )}
              </div>
            )}

            {notesTab === "transcript" && m.transcript ? (
              <div className="section-card">
                <div className="section-label">{t('notes.transcript.full')}</div>
                <div className="section-body transcript-body">
                  <TranscriptView segments={m.transcript._segments} />
                </div>
              </div>
            ) : (
            <>
            {showMetaBar && (
              <div className="ai-meta-bar">
                <span className="ai-meta-item">
                  <strong>{actions.length}</strong> {t('notes.bar.actions')}
                </span>
                <span className="ai-meta-item">
                  <strong>{decisions.length}</strong> {t('notes.bar.decisions')}
                </span>
                <span className="ai-meta-item">
                  <strong>{participants.length}</strong> {t('notes.bar.participants')}
                </span>
                {m.coach && (
                  <button
                    className="tool-btn"
                    style={{ marginLeft: "auto" }}
                    onClick={() => setCoachVisible(!coachVisible)}
                  >
                    {t('notes.bar.coachRecap')}
                  </button>
                )}
              </div>
            )}
            {coachVisible && <CoachRecap coach={m.coach} />}

            {conflicts.map((c) => (
              <ConflictCard key={c.id} conflict={c} onResolve={resolveConflict} />
            ))}

            {headsUp.length > 0 && (
              <div className="section-card warning">
                <div className="section-label">
                  <WarnIcon size={13} /> {t('notes.bar.headsUp')}
                </div>
                <div className="section-body">
                  <ul>
                    {headsUp.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div
              className="section-card stagger"
              data-section="Executive Summary"
              style={{ animationDelay: "0ms" }}
            >
              <CardFigures section="Executive Summary" />
              <div className="section-label">
                <SparkIcon size={13} /> Executive Summary
              </div>
              <Markdown text={executiveSummary} />
            </div>

            <div
              className="section-card stagger"
              data-tour="action-items"
              data-section="Action Items"
              style={{ animationDelay: "60ms" }}
            >
              <CardFigures section="Action Items" />
              <div className="section-label action-section-label">
                <span><CheckIcon size={13} /> {t('notes.section.actionItems')}</span>
                <span className="action-section-tools">
                  <button
                    className={`toolbar-btn${myItemsOnly ? " primary" : ""}`}
                    onClick={() => {
                      setMyItemsOnly((v) => !v);
                      api
                        .get("/api/settings/user-name")
                        .then((r) => setUserName(r.user_name || ""))
                        .catch(() => {});
                    }}
                  >
                    {t('notes.action.myItems')}
                  </button>
                  {myItemsOnly && userName && (
                    <button className="toolbar-btn" onClick={downloadMyActions}>
                      <ExportIcon size={13} /> {t('notes.action.download')}
                    </button>
                  )}
                </span>
              </div>
              {myItemsOnly && !userName ? (
                <div className="section-empty-note">
                  {t('notes.action.setNameFilter')}
                </div>
              ) : (
                (() => {
                  const list = myItemsOnly
                    ? actions.filter(
                        (a) =>
                          (a.owner || "").trim().toLowerCase() ===
                          userName.trim().toLowerCase()
                      )
                    : actions;
                  if (myItemsOnly && list.length === 0) {
                    return (
                      <div className="section-empty-note">
                        {t('notes.action.noneAssigned')}
                      </div>
                    );
                  }
                  return list.map((a) => (
                    <ActionRow key={a.id} item={a} onAssign={assign} onComplete={completeAction} />
                  ));
                })()
              )}
            </div>

            <div
              className="section-card stagger"
              data-section="Key Decisions"
              style={{ animationDelay: "120ms" }}
            >
              <CardFigures section="Key Decisions" />
              <div className="section-label">
                <GavelIcon size={13} /> {t('notes.section.keyDecisions')}
              </div>
              <div className="section-body">
                <ul>
                  {decisions.map((d) => (
                    <li key={d.id} className={d.status === "superseded" ? "superseded" : ""}>
                      {d.text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Template-driven sections, in the order Claude produced them */}
            {sectionEntries.map(([name, body], i) => {
              const Icon = SECTION_ICONS[name];
              return (
                <div
                  className={`section-card stagger${name === "Compliance Flags" ? " warning" : ""}`}
                  style={{ animationDelay: `${Math.min(i + 3, 6) * 60}ms` }}
                  data-section={FIG_SECTIONS.has(name) ? name : undefined}
                  key={name}
                >
                  <CardFigures section={name} />
                  <div className="section-label">
                    {Icon && <Icon size={13} />} {name}
                  </div>
                  <Markdown text={body} />
                </div>
              );
            })}

            {related.length > 0 && (
              <div className="section-card stagger">
                <div className="section-label">{t('notes.section.relatedMeetings')}</div>
                {related.map((r) => (
                  <button
                    key={r.meeting_id}
                    className="related-row"
                    onClick={() => selectMeeting(r.meeting_id)}
                  >
                    <span className="related-title">{r.title}</span>
                    <span className="related-topics">
                      {r.shared_topics.map((t) => (
                        <span className="topic-tag" key={t}>
                          {t}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="notes-toolbar">
              <button className="toolbar-btn primary" onClick={() => setFollowUpOpen(true)}>
                <SendIcon size={13} /> {t('notes.toolbar.followup')}
              </button>
              <button className="toolbar-btn" onClick={() => doExport("pdf")}>
                <ExportIcon size={13} /> {t('notes.toolbar.pdf')}
              </button>
              <button className="toolbar-btn" onClick={() => doExport("markdown")}>
                <ExportIcon size={13} /> {t('notes.toolbar.md')}
              </button>
              <button className="toolbar-btn" onClick={copySlackDigest}>
                <ExportIcon size={13} /> {t('notes.toolbar.slackDigest')}
              </button>
              <div style={{ position: "relative" }}>
                <button className="toolbar-btn" onClick={() => setSendOpen(!sendOpen)}>
                  <SendIcon size={13} /> {t('notes.toolbar.sendTo')}
                </button>
                {sendOpen && (
                  <div className="popover-menu">
                    {Object.entries(INTEGRATION_LABELS).map(([key, label]) => (
                      <button key={key} className="nav-item" onClick={() => sendTo(key)}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <button className="toolbar-btn" onClick={() => setRegenOpen(!regenOpen)}>
                  <RefreshIcon size={13} /> {t('notes.toolbar.regenerate')}
                </button>
                {regenOpen && (
                  <div className="popover-menu">
                    {templates.map((t) => (
                      <button key={t.id} className="nav-item" onClick={() => regenerateWith(t.id)}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            </>
            )}
          </>
        )}
      </div>
      {followUpOpen && <FollowUp meeting={m} onClose={() => setFollowUpOpen(false)} />}
      {shareModal && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 70 }}
          onMouseDown={(e) => e.target === e.currentTarget && setShareModal(null)}
        >
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-header">
              <div className="modal-title">{t('notes.share.created')}</div>
              <button className="icon-btn" onClick={() => setShareModal(null)} aria-label={t('notes.share.close')}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: "flex", gap: 7 }}>
                <input className="text-input" readOnly value={shareModal.url} onFocus={(e) => e.target.select()} />
                <button className="btn" onClick={copyShareLink}>
                  {t('notes.share.copyLink')}
                </button>
              </div>
              <div className="field-help" style={{ marginTop: 8 }}>
                {t('notes.share.expires')}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button className="btn secondary" onClick={() => setShareModal(null)}>
                  {t('notes.share.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

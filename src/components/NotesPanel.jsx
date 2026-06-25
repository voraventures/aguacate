import React, { useEffect, useRef, useState } from "react";
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
  return (
    <div className="empty-state" data-tour="notes-panel">
      <div className="empty-art">
        <EmptyNotes />
      </div>
      <div className="empty-title">Select a meeting</div>
      <div className="empty-sub">Choose a meeting from the list to view its notes</div>
    </div>
  );
}

function ProcessingState({ stage, pct }) {
  const labels = {
    recording: "Recording in progress…",
    transcribing: pct
      ? `Transcribing locally — ${Math.round(pct * 100)}%`
      : "Transcribing locally with Whisper…",
    generating: "Claude is writing your notes…",
  };
  return (
    <div className="processing-state">
      <div className="processing-ring" />
      <div style={{ fontSize: 12 }}>
        {labels[stage] || "Processing…"}
      </div>
      <div style={{ fontSize: 11.5 }}>Audio never leaves this Mac.</div>
    </div>
  );
}

function ActionRow({ item, onAssign, onComplete }) {
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
        {isTbd ? "TBD" : item.owner}
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
            placeholder="Owner"
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
            Assign
          </button>
        )}
        <button className="tool-btn" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          className={`tool-btn${done ? " done" : ""}`}
          onClick={() => onComplete(item)}
          title={done ? "Mark incomplete" : "Mark complete"}
        >
          {done ? (
            <>
              <CheckIcon size={12} /> Done
            </>
          ) : (
            "Complete"
          )}
        </button>
      </span>
    </div>
  );
}

function ConflictCard({ conflict, onResolve }) {
  return (
    <div className="conflict-card">
      <div className="section-label" style={{ color: "var(--danger)" }}>
        <WarnIcon size={13} /> Conflict detected
      </div>
      <div className="conflict-pair">
        <div className="conflict-side new">
          <span className="conflict-tag">NEW</span>
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
          New decision supersedes
        </button>
        <button className="btn secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => onResolve(conflict.id, "reviewed")}>
          Mark reviewed
        </button>
      </div>
    </div>
  );
}

function CoachRecap({ coach }) {
  if (!coach || !coach.elapsed_sec) return null;
  return (
    <div className="ai-meta-bar" style={{ marginTop: 12 }}>
      <span className="ai-meta-item">
        <strong>{Math.round((coach.talk_density || 0) * 100)}%</strong> speaking density
      </span>
      <span className="ai-meta-item">
        <strong>{coach.questions}</strong> questions
      </span>
      <span className="ai-meta-item">
        <strong>{coach.fillers}</strong> fillers
      </span>
      <span className="ai-meta-item">
        <strong>{coach.long_silences}</strong> long silences
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
  if (!segments || segments.length === 0) {
    return <p style={{ color: "var(--muted)", fontSize: 12 }}>No transcript available.</p>;
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

export default function NotesPanel() {
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
    if (window.confirm("Delete this meeting? This cannot be undone.")) {
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
  const sectionEntries = Object.entries(sections).filter(
    ([name, body]) => !SPECIAL_SECTIONS.has(name) && body?.trim()
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
    const ok = () => showToast("Link copied");
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
      showToast("Copy failed — select and copy manually", "error");
    }
    document.body.removeChild(ta);
  }

  const resolveConflict = (conflictId, resolution) => {
    api
      .patch(`/api/intelligence/conflicts/${conflictId}`, { resolution })
      .then(() => {
        refreshDetail();
        showToast(resolution === "superseded" ? "Old decision superseded" : "Marked reviewed");
      })
      .catch((e) => showToast(e.message, "error"));
  };

  const doExport = (fmt) => {
    api
      .post(`/api/export/${m.id}/${fmt}`)
      .then(({ path }) => {
        showToast(`Exported ${fmt.toUpperCase()}`);
        showInFolder(path);
      })
      .catch((e) => showToast(e.message, "error"));
  };

  const copySlackDigest = () => {
    api
      .get(`/api/export/${m.id}/slack`)
      .then(({ text }) =>
        navigator.clipboard.writeText(text).then(() => showToast("Slack digest copied"))
      )
      .catch((e) => showToast(e.message, "error"));
  };

  const downloadMyActions = () => {
    api
      .post(`/api/export/${m.id}/my-actions`)
      .then(({ path }) => {
        showToast("Exported your action items");
        showInFolder(path);
      })
      .catch((e) => showToast(e.message, "error"));
  };

  const sendTo = (provider) => {
    setSendOpen(false);
    showToast(`Sending to ${INTEGRATION_LABELS[provider]}…`);
    api
      .post(`/api/integrations/${provider}/send/${m.id}`)
      .then((r) => showToast(r.message))
      .catch((e) => showToast(e.message, "error"));
  };

  const regenerateWith = (templateId) => {
    setRegenOpen(false);
    api
      .post(`/api/meetings/${m.id}/regenerate`, { template_id: templateId })
      .then(() => showToast("Regenerating notes…"))
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
              <MicIcon size={11} /> Recorded
            </span>
          )}
          <span className="pill">
            <ClockIcon size={11} /> {fmtDate}
          </span>
          {participants.length > 0 && (
            <span className="pill">
              <UsersIcon size={11} /> {participants.length} attendee
              {participants.length !== 1 ? "s" : ""}
            </span>
          )}
          {templateName && templateName !== "Default" && (
            <span className="pill">
              <TagIcon size={11} /> {templateName}
            </span>
          )}
          {!!m.followup_sent && (
            <span className="pill rec">
              <SendIcon size={11} /> Follow-up sent
            </span>
          )}
          <div className="notes-header-menu" ref={moreRef}>
            <button
              className="notes-header-menu-btn"
              aria-label="More options"
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
                  Share meeting
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMoreOpen(false);
                    api
                      .post(`/api/meetings/${m.id}/share-to-workspace`)
                      .then(() => showToast("Shared to team workspace"))
                      .catch((e) => showToast(e.message, "error"));
                  }}
                >
                  Share to team
                </button>
                <button className="delete-menu-item" onClick={deleteFromNotes}>
                  Delete meeting
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
              <WarnIcon size={13} /> Processing failed
            </div>
            <div className="section-body">
              <p>{m.error || "Something went wrong while processing this meeting."}</p>
            </div>
            <button
              className="toolbar-btn"
              style={{ marginTop: 12 }}
              onClick={() => regenerateWith(null)}
            >
              <RefreshIcon size={13} /> Retry notes generation
            </button>
          </div>
        ) : !m.notes ? (
          <div className="processing-state">
            <div style={{ fontSize: 13 }}>No notes for this meeting yet.</div>
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
                  Notes
                </button>
                <button
                  className={`notes-tab-btn${notesTab === "transcript" ? " active" : ""}`}
                  onClick={() => setNotesTab("transcript")}
                >
                  Transcript
                </button>
                {m.workspace_id && (
                  <span className="workspace-shared-badge">Shared</span>
                )}
              </div>
            )}

            {notesTab === "transcript" && m.transcript ? (
              <div className="section-card">
                <div className="section-label">Full Transcript</div>
                <div className="section-body transcript-body">
                  <TranscriptView segments={m.transcript._segments} />
                </div>
              </div>
            ) : (
            <>
            {showMetaBar && (
              <div className="ai-meta-bar">
                <span className="ai-meta-item">
                  <strong>{actions.length}</strong> Actions
                </span>
                <span className="ai-meta-item">
                  <strong>{decisions.length}</strong> Decisions
                </span>
                <span className="ai-meta-item">
                  <strong>{participants.length}</strong> Participants
                </span>
                {m.coach && (
                  <button
                    className="tool-btn"
                    style={{ marginLeft: "auto" }}
                    onClick={() => setCoachVisible(!coachVisible)}
                  >
                    Coach recap
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
                  <WarnIcon size={13} /> Heads up
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

            {/* Template-driven sections, in the order Claude produced them */}
            {sectionEntries.map(([name, body], i) => {
              const Icon = SECTION_ICONS[name];
              const card = (
                <div
                  className={`section-card stagger${name === "Compliance Flags" ? " warning" : ""}`}
                  style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
                  key={name}
                >
                  <div className="section-label">
                    {Icon && <Icon size={13} />} {name}
                  </div>
                  <Markdown text={body} />
                </div>
              );
              // Action Items / Decisions cards are injected after the first section
              if (i === 0) {
                return (
                  <React.Fragment key={name}>
                    {card}
                    {actions.length > 0 && (
                      <div className="section-card stagger" data-tour="action-items" style={{ animationDelay: "60ms" }}>
                        <div className="section-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span><CheckIcon size={13} /> Action Items</span>
                          <span style={{ display: "flex", gap: 6 }}>
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
                              My items
                            </button>
                            {myItemsOnly && userName && (
                              <button className="toolbar-btn" onClick={downloadMyActions}>
                                <ExportIcon size={13} /> Download
                              </button>
                            )}
                          </span>
                        </div>
                        {myItemsOnly && !userName ? (
                          <div style={{ color: "#767b72", padding: "4px 2px", fontSize: 13 }}>
                            Set your name in Settings → General to filter your items
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
                                <div style={{ color: "#767b72", padding: "4px 2px", fontSize: 13 }}>
                                  No action items assigned to you in this meeting.
                                </div>
                              );
                            }
                            return list.map((a) => (
                              <ActionRow key={a.id} item={a} onAssign={assign} onComplete={completeAction} />
                            ));
                          })()
                        )}
                      </div>
                    )}
                    {decisions.length > 0 && (
                      <div className="section-card stagger" style={{ animationDelay: "120ms" }}>
                        <div className="section-label">
                          <GavelIcon size={13} /> Key Decisions
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
                    )}
                  </React.Fragment>
                );
              }
              return card;
            })}

            {related.length > 0 && (
              <div className="section-card stagger">
                <div className="section-label">Related Meetings</div>
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
                <SendIcon size={13} /> Follow-up
              </button>
              <button className="toolbar-btn" onClick={() => doExport("pdf")}>
                <ExportIcon size={13} /> PDF
              </button>
              <button className="toolbar-btn" onClick={() => doExport("markdown")}>
                <ExportIcon size={13} /> MD
              </button>
              <button className="toolbar-btn" onClick={copySlackDigest}>
                <ExportIcon size={13} /> Slack digest
              </button>
              <div style={{ position: "relative" }}>
                <button className="toolbar-btn" onClick={() => setSendOpen(!sendOpen)}>
                  <SendIcon size={13} /> Send to…
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
                  <RefreshIcon size={13} /> Regenerate
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
              <div className="modal-title">Meeting link created</div>
              <button className="icon-btn" onClick={() => setShareModal(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: "flex", gap: 7 }}>
                <input className="text-input" readOnly value={shareModal.url} onFocus={(e) => e.target.select()} />
                <button className="btn" onClick={copyShareLink}>
                  Copy link
                </button>
              </div>
              <div className="field-help" style={{ marginTop: 8 }}>
                Link expires in 30 days. Anyone with this link can view a read-only summary
                of this meeting.
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button className="btn secondary" onClick={() => setShareModal(null)}>
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

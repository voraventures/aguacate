// Smart Follow-up Composer: Claude drafts, you edit, one click to send.
import React, { useState } from "react";
import { api, openExternal } from "../api.js";
import { useStore } from "../store.jsx";
import { XIcon } from "./icons.jsx";

const TONES = [
  ["professional", "Professional"],
  ["friendly", "Friendly"],
  ["concise", "Concise"],
];

export default function FollowUp({ meeting, onClose }) {
  const { showToast, refreshDetail } = useStore();
  const [tone, setTone] = useState("professional");
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recipients, setRecipients] = useState("");

  const generate = async (selectedTone) => {
    setBusy(true);
    try {
      const r = await api.post(`/api/meetings/${meeting.id}/followup`, {
        tone: selectedTone,
      });
      setDraft({ subject: r.subject, body: r.body });
      if (!recipients && r.attendees?.length) {
        setRecipients(r.attendees.join(", "));
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const markSent = () => {
    api.post(`/api/meetings/${meeting.id}/followup/sent`).then(refreshDetail).catch(() => {});
  };

  const openMail = () => {
    const mailto = `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
    openExternal(mailto);
    markSent();
    showToast("Opened in your mail client");
  };

  const copyAll = () => {
    navigator.clipboard
      .writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
      .then(() => {
        markSent();
        showToast("Follow-up copied to clipboard");
      });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 680 }}>
        <div className="modal-header">
          <div className="modal-title">Follow-up email</div>
          <button className="icon-btn" onClick={onClose}>
            <XIcon size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div className="tone-row">
            {TONES.map(([key, label]) => (
              <button
                key={key}
                className={`tone-chip${tone === key ? " active" : ""}`}
                onClick={() => {
                  setTone(key);
                  generate(key);
                }}
              >
                {label}
              </button>
            ))}
            {!draft && (
              <button className="btn" disabled={busy} onClick={() => generate(tone)}>
                {busy ? "Drafting…" : "Draft with Claude"}
              </button>
            )}
          </div>

          {busy && draft && <div className="field-help">Redrafting…</div>}

          {draft && (
            <>
              <div className="field" style={{ marginTop: 16 }}>
                <label className="field-label">To</label>
                <input
                  className="text-input"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder="Recipients"
                  spellCheck={false}
                />
              </div>
              <div className="field">
                <label className="field-label">Subject</label>
                <input
                  className="text-input"
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label">Body</label>
                <textarea
                  className="text-input"
                  style={{ minHeight: 220, resize: "vertical", lineHeight: 1.6 }}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={openMail}>
                  Open in Mail
                </button>
                <button className="btn secondary" onClick={copyAll}>
                  Copy
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Smart Follow-up Composer: Claude drafts, you edit, one click to send.
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, openExternal } from "../api.js";
import { useStore } from "../store.jsx";
import { XIcon } from "./icons.jsx";

const TONES = ["professional", "friendly", "concise"];

export default function FollowUp({ meeting, onClose }) {
  const { t } = useTranslation();
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
    showToast(t("followUp.openedMail"));
  };

  const copyAll = () => {
    navigator.clipboard
      .writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
      .then(() => {
        markSent();
        showToast(t("followUp.copied"));
      });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 680 }}>
        <div className="modal-header">
          <div className="modal-title">{t("followUp.title")}</div>
          <button className="icon-btn" onClick={onClose} aria-label={t("common.close")}>
            <XIcon size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div className="tone-row">
            {TONES.map((key) => (
              <button
                key={key}
                className={`tone-chip${tone === key ? " active" : ""}`}
                onClick={() => {
                  setTone(key);
                  generate(key);
                }}
              >
                {t(`followUp.tone.${key}`)}
              </button>
            ))}
            {!draft && (
              <button className="btn" disabled={busy} onClick={() => generate(tone)}>
                {busy ? t("followUp.drafting") : t("followUp.draftCta")}
              </button>
            )}
          </div>

          {busy && draft && <div className="field-help">{t("followUp.redrafting")}</div>}

          {draft && (
            <>
              <div className="field" style={{ marginTop: 16 }}>
                <label className="field-label">{t("followUp.to")}</label>
                <input
                  className="text-input"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder={t("followUp.recipients")}
                  spellCheck={false}
                />
              </div>
              <div className="field">
                <label className="field-label">{t("followUp.subject")}</label>
                <input
                  className="text-input"
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="field-label">{t("followUp.body")}</label>
                <textarea
                  className="text-input"
                  style={{ minHeight: 220, resize: "vertical", lineHeight: 1.6 }}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={openMail}>
                  {t("followUp.openInMail")}
                </button>
                <button className="btn secondary" onClick={copyAll}>
                  {t("common.copy")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

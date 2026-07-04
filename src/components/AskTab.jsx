// Ask tab — recreated from Aguacate Meeting.dc.html #5e: right-aligned
// green-tint question bubbles, answer cards fronted by a small logo-mark
// tile with real "Sources" (quoted, grounded text — never a fabricated
// timestamp we can't verify), thumbs up/down, suggested-question chips, and
// the input bar pinned to the bottom of this tab only (locked decision).
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api.js";
import { useStore, useLogo } from "../store.jsx";
import { SendIcon, ThumbDownIcon, ThumbUpIcon } from "./icons.jsx";

const storageKey = (meetingId) => `aguacate_ask_${meetingId}`;
const SUGGESTIONS = ["risks", "pricing", "unresolved"];

function loadThread(meetingId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(meetingId)) || "[]");
  } catch {
    return [];
  }
}

export default function AskTab({ meeting }) {
  const { t } = useTranslation();
  const { showToast } = useStore();
  const logoUrl = useLogo();
  const [thread, setThread] = useState(() => loadThread(meeting.id));
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    setThread(loadThread(meeting.id));
  }, [meeting.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [thread, asking]);

  const persist = (next) => {
    setThread(next);
    localStorage.setItem(storageKey(meeting.id), JSON.stringify(next.slice(-50)));
  };

  const ask = (text) => {
    const q = (text ?? input).trim();
    if (q.length < 3 || asking) return;
    setInput("");
    setAsking(true);
    api
      .post(`/api/meetings/${meeting.id}/ask`, { query: q })
      .then((r) =>
        persist([...thread, { q, answer: r.answer, sources: r.sources || [], fb: null }])
      )
      .catch((e) => {
        showToast(e.message, "error");
        setInput(q);
      })
      .finally(() => setAsking(false));
  };

  const feedback = (idx, value) => {
    const next = thread.map((entry, i) =>
      i === idx ? { ...entry, fb: entry.fb === value ? null : value } : entry
    );
    persist(next);
  };

  return (
    <>
      <div className="ask-thread">
        {thread.length === 0 && !asking && (
          <div className="ask-empty">
            <div className="ask-empty-title">{t("ask.emptyHead")}</div>
            <div className="empty-sub">{t("ask.emptySub")}</div>
          </div>
        )}
        {thread.map((entry, i) => (
          <React.Fragment key={i}>
            <div className="ask-bubble-row">
              <div className="ask-bubble">{entry.q}</div>
            </div>
            <div className="answer-row">
              <span className="answer-icon">
                <img src={logoUrl} alt="" aria-hidden="true" />
              </span>
              <div className="answer-card">
                <p className="answer-text">{entry.answer}</p>
                {entry.sources?.length > 0 && (
                  <div className="answer-sources">
                    <span className="answer-source-label">{t("ask.sources")}</span>
                    {entry.sources.map((s, j) => (
                      <span className="answer-source-chip" key={j} title={s.quote}>
                        {s.quote.length > 28 ? `${s.quote.slice(0, 28)}…` : s.quote}
                      </span>
                    ))}
                    <div style={{ flex: 1 }} />
                    <button
                      className={`answer-fb-btn${entry.fb === "up" ? " on" : ""}`}
                      aria-label={t("ask.helpful")}
                      onClick={() => feedback(i, "up")}
                    >
                      <ThumbUpIcon size={14} />
                    </button>
                    <button
                      className={`answer-fb-btn${entry.fb === "down" ? " on" : ""}`}
                      aria-label={t("ask.notHelpful")}
                      onClick={() => feedback(i, "down")}
                    >
                      <ThumbDownIcon size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </React.Fragment>
        ))}
        {asking && (
          <div className="ask-thinking" aria-label={t("ask.thinking")}>
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="ask-inputbar">
        <div className="ask-suggestions">
          {SUGGESTIONS.map((key) => (
            <button key={key} className="ask-suggestion-chip" onClick={() => ask(t(`ask.suggestion.${key}`))}>
              {t(`ask.suggestion.${key}`)}
            </button>
          ))}
        </div>
        <div className="ask-inputbar-inner">
          <input
            placeholder={t("ask.placeholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            spellCheck={false}
          />
          <button
            className="ask-send"
            onClick={() => ask()}
            disabled={input.trim().length < 3 || asking}
            aria-label={t("ask.send")}
          >
            <SendIcon size={15} />
          </button>
        </div>
      </div>
    </>
  );
}

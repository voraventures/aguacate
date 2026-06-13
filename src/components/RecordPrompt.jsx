// Auto-record prompt: countdown ring 30s before a calendar meeting starts.
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store.jsx";

const RING_R = 38;
const CIRC = 2 * Math.PI * RING_R;

export default function RecordPrompt() {
  const { prompt, setPrompt, startRecording } = useStore();
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef(null);
  const totalRef = useRef(30);

  useEffect(() => {
    if (!prompt) return undefined;
    const initial = Math.max(3, prompt.seconds_until_start || 30);
    totalRef.current = initial;
    setRemaining(initial);
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timerRef.current);
          // countdown elapsed: auto-start in "all" mode, dismiss otherwise
          if (prompt.auto) {
            startRecording({ title: prompt.title, calendarEventId: prompt.event_id }).catch(() => {});
          }
          setPrompt(null);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [prompt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!prompt) return null;

  const frac = remaining / totalRef.current;

  const confirm = () => {
    clearInterval(timerRef.current);
    setPrompt(null);
    startRecording({ title: prompt.title, calendarEventId: prompt.event_id }).catch(() => {});
  };

  const dismiss = () => {
    clearInterval(timerRef.current);
    setPrompt(null);
  };

  return (
    <div className="modal-backdrop">
      <div className="prompt-card">
        <div className="countdown-ring">
          <svg width="88" height="88">
            <circle cx="44" cy="44" r={RING_R} fill="none" stroke="var(--accent-soft)" strokeWidth="6" />
            <circle
              cx="44"
              cy="44"
              r={RING_R}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - frac)}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <span className="countdown-num">{remaining}</span>
        </div>
        <div className="prompt-title">{prompt.title}</div>
        <div className="prompt-sub">
          {prompt.auto
            ? "Recording starts automatically when the countdown ends"
            : "Starting soon — record this meeting?"}
          {prompt.attendees?.length
            ? ` · ${prompt.attendees.length} attendee${prompt.attendees.length !== 1 ? "s" : ""}`
            : ""}
        </div>
        <div className="prompt-actions">
          <button className="btn secondary" onClick={dismiss}>
            Skip
          </button>
          <button className="btn" onClick={confirm}>
            Record now
          </button>
        </div>
      </div>
    </div>
  );
}

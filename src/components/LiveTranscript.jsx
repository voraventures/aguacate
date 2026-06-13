import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store.jsx";

function fmtElapsed(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function LiveTranscript({ startedAt }) {
  const { recordingLevel, liveTranscriptChunks } = useStore();
  const [seconds, setSeconds] = useState(0);
  const baseRef = useRef(startedAt ? new Date(startedAt).getTime() : Date.now());
  const scrollRef = useRef(null);

  useEffect(() => {
    const tick = () =>
      setSeconds(Math.max(0, Math.floor((Date.now() - baseRef.current) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll to bottom as new text arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveTranscriptChunks]);

  const level = Math.min(1, Math.max(0, recordingLevel || 0));
  const hasChunks = liveTranscriptChunks && liveTranscriptChunks.length > 0;

  return (
    <div className="live-transcript">
      <div className="live-transcript-head">
        <span className="live-dot" />
        <span className="live-label">Recording…</span>
        <span className="live-elapsed">{fmtElapsed(seconds)}</span>
      </div>
      <div className="live-meter" aria-hidden="true">
        <div className="live-meter-fill" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
      <div className="live-transcript-body" ref={scrollRef}>
        {hasChunks ? (
          <div className="live-chunks">
            {liveTranscriptChunks.map((chunk, i) => {
              const isLast = i === liveTranscriptChunks.length - 1;
              return (
                <span
                  key={i}
                  className="live-chunk"
                  style={{ opacity: isLast ? 0.7 : 1 }}
                >
                  {chunk}
                  {isLast && <span className="live-cursor" aria-hidden="true">▌</span>}
                  {" "}
                </span>
              );
            })}
          </div>
        ) : (
          <p>
            Capturing audio locally. Transcription preview will appear here — your
            audio never leaves the device.
          </p>
        )}
      </div>
    </div>
  );
}

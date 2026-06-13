import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store.jsx";

function fmtElapsed(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Live recording panel shown in the notes area while the selected meeting is
// actively recording. Elapsed time and the audio-level meter are real
// (recording_level RMS over the existing WebSocket). Word-by-word transcript is
// not streamed by the backend — Whisper transcribes the full audio on-device
// after you stop — so we surface that truthfully instead of inventing text.
export default function LiveTranscript({ startedAt }) {
  const { recordingLevel } = useStore();
  const [seconds, setSeconds] = useState(0);
  const baseRef = useRef(startedAt ? new Date(startedAt).getTime() : Date.now());

  useEffect(() => {
    const tick = () =>
      setSeconds(Math.max(0, Math.floor((Date.now() - baseRef.current) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const level = Math.min(1, Math.max(0, recordingLevel || 0));

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
      <div className="live-transcript-body">
        <p>
          Capturing audio locally. Live transcription runs 100% on this Mac after you
          stop recording — your audio never leaves the device.
        </p>
      </div>
    </div>
  );
}

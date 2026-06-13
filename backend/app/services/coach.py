"""Meeting Coach: live conversational intelligence during recording.

Every ~12s the coach transcribes the newest audio with the local Whisper
model and updates pattern-matched stats — no API calls during the meeting:
  - speaking density (speech time vs elapsed time)
  - question count
  - filler-word count (um, uh, like, you know, sort of, kind of)
  - long silences (> 5s of no speech)
  - template section coverage (which sections have been touched)
"""
import logging
import re
import threading
import time

import numpy as np

from ..events import hub
from .recorder import TARGET_SR, recorder

log = logging.getLogger("aguacate.coach")

FILLER_RE = re.compile(
    r"\b(um+|uh+|erm+|like|you know|sort of|kind of|basically|actually)\b", re.I
)
INTERVAL = 12  # seconds between coach passes
SILENCE_THRESHOLD = 5.0  # seconds


class Coach:
    def __init__(self):
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._summary: dict | None = None

    def start(self, meeting_id: str, section_names: list[str]) -> None:
        self.stop()  # safety: never two coach threads
        self._stop.clear()
        self._summary = None
        self._thread = threading.Thread(
            target=self._run, args=(meeting_id, section_names), daemon=True
        )
        self._thread.start()

    def stop(self) -> dict | None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=INTERVAL + 5)
            self._thread = None
        return self._summary

    def _run(self, meeting_id: str, section_names: list[str]) -> None:
        from . import transcriber

        try:
            model = transcriber._load_model()
        except Exception as exc:
            log.warning("Coach disabled — whisper unavailable: %s", exc)
            return

        cursor: dict = {}
        stats = {
            "speech_sec": 0.0,
            "elapsed_sec": 0.0,
            "words": 0,
            "questions": 0,
            "fillers": 0,
            "long_silences": 0,
            "covered_sections": [],
        }
        transcript_acc = ""
        trailing_silence = 0.0
        started = time.monotonic()
        # skip the tail sections every template shares — coaching on them is noise
        coachable = [
            s for s in section_names
            if s not in ("Decisions Made", "Action Items", "Next Steps", "Executive Summary")
        ]

        while not self._stop.wait(INTERVAL):
            if not recorder.is_recording or recorder.meeting_id != meeting_id:
                break
            try:
                audio = recorder.drain_for_coach(cursor)
                if len(audio) < TARGET_SR:  # under a second of new audio
                    continue
                chunk_dur = len(audio) / TARGET_SR
                with transcriber.transcribe_lock:
                    segments, _info = model.transcribe(
                        audio, vad_filter=True, language="en", beam_size=1
                    )
                    seg_list = [(s.start, s.end, s.text) for s in segments]

                speech = sum(end - start for start, end, _ in seg_list)
                text = " ".join(t.strip() for _, _, t in seg_list)
                stats["speech_sec"] += speech
                stats["elapsed_sec"] = time.monotonic() - started
                stats["words"] += len(text.split())
                stats["questions"] += text.count("?")
                stats["fillers"] += len(FILLER_RE.findall(text))

                # silence detection across chunk boundaries
                if not seg_list:
                    trailing_silence += chunk_dur
                else:
                    leading_gap = seg_list[0][0]
                    if trailing_silence + leading_gap > SILENCE_THRESHOLD:
                        stats["long_silences"] += 1
                    gaps = [
                        seg_list[i + 1][0] - seg_list[i][1]
                        for i in range(len(seg_list) - 1)
                    ]
                    stats["long_silences"] += sum(1 for g in gaps if g > SILENCE_THRESHOLD)
                    trailing_silence = chunk_dur - seg_list[-1][1]

                transcript_acc = (transcript_acc + " " + text)[-24000:]
                lower = transcript_acc.lower()
                stats["covered_sections"] = [
                    s for s in coachable
                    if any(
                        word in lower
                        for word in s.lower().split()
                        if len(word) > 3
                    )
                ]

                density = (
                    stats["speech_sec"] / stats["elapsed_sec"]
                    if stats["elapsed_sec"] > 0
                    else 0
                )
                with self._lock:
                    self._summary = {
                        **stats,
                        "talk_density": round(min(1.0, density), 2),
                        "total_sections": len(coachable),
                    }
                hub.emit("coach_update", {"meeting_id": meeting_id, **self._summary})
            except Exception:
                log.exception("Coach pass failed")


coach = Coach()

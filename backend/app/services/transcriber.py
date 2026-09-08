"""Local Whisper transcription via faster-whisper. Audio never leaves the device."""
import json
import logging
import re
import threading
import wave
from pathlib import Path

import numpy as np

from ..config import TRANSCRIPTS_DIR, WHISPER_MODEL, write_secure_text
from ..db import get_db, get_setting
from ..events import hub

log = logging.getLogger("aguacate.transcriber")

_model = None
_model_lock = threading.Lock()
# faster-whisper transcribe() calls are serialized (coach + pipeline share the model)
transcribe_lock = threading.Lock()

VAD_PARAMS = {
    "min_speech_duration_ms": 100,
    "min_silence_duration_ms": 300,
    "speech_pad_ms": 200,
}

# Separate tiny model for live chunked transcription (does not block main pipeline)
_tiny_model = None
_tiny_model_lock = threading.Lock()


def _load_model():
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel

            size = get_setting("whisper_model", WHISPER_MODEL)
            log.info("Loading faster-whisper model %r", size)
            _model = WhisperModel(size, device="auto", compute_type="int8")
        return _model


def _load_tiny_model():
    global _tiny_model
    with _tiny_model_lock:
        if _tiny_model is None:
            from faster_whisper import WhisperModel

            log.info("Loading tiny faster-whisper model for live preview")
            _tiny_model = WhisperModel("tiny", device="auto", compute_type="int8")
        return _tiny_model


def is_available() -> bool:
    try:
        import faster_whisper  # noqa: F401

        return True
    except ImportError:
        return False


def apply_redaction(text: str) -> str:
    """Privacy: redact configured words/names from transcripts (and therefore
    from everything downstream — notes, search, exports)."""
    words = get_setting("redact_words", [])
    for word in words:
        if isinstance(word, str) and word.strip():
            text = re.sub(
                rf"\b{re.escape(word.strip())}\b", "█████", text, flags=re.I
            )
    return text


def diarize_segments(segments: list[dict], silence_threshold: float = 1.5) -> list[dict]:
    """Assign speaker labels to segments using silence-gap heuristic.

    When there is a gap >= silence_threshold seconds between two segments the
    speaker is assumed to have changed.  Speakers are labelled sequentially:
    Speaker 1, Speaker 2, etc.  We cap at 10 distinct speakers to avoid
    pathological fragmentation on noisy audio.
    """
    if not segments:
        return segments

    MAX_SPEAKERS = 10
    diarized = []
    speaker_idx = 0
    prev_end = segments[0]["start"]

    for seg in segments:
        gap = seg["start"] - prev_end
        if gap >= silence_threshold and speaker_idx < MAX_SPEAKERS - 1:
            speaker_idx += 1
        seg_copy = dict(seg)
        seg_copy["speaker"] = f"Speaker {speaker_idx + 1}"
        diarized.append(seg_copy)
        prev_end = seg["end"]

    return diarized


def transcribe_chunk(audio_array) -> str:
    """Transcribe a raw numpy audio array (16 kHz mono float32) with the tiny model.
    Returns plain text.  Used for live preview only."""
    if not is_available():
        return ""
    try:
        model = _load_tiny_model()
        segments, _ = model.transcribe(audio_array, vad_filter=False)
        parts = [apply_redaction(s.text.strip()) for s in segments if s.text.strip()]
        return " ".join(parts)
    except Exception as exc:
        log.debug("Live chunk transcription failed: %s", exc)
        return ""


def transcribe(meeting_id: str, audio_path: Path) -> dict:
    """Run Whisper on the wav, emitting progress events. Returns transcript info
    including timestamped segments (for Flagged Moments provenance) and diarized
    text with speaker labels."""
    hub.emit("transcription_started", {"meeting_id": meeting_id})
    if not is_available():
        raise RuntimeError(
            "faster-whisper is not installed. Run: pip install faster-whisper"
        )
    model = _load_model()
    with transcribe_lock:
        segments, info = model.transcribe(
            str(audio_path),
            vad_filter=True,
            vad_parameters=VAD_PARAMS,
        )

        parts = []
        seg_data = []
        duration = info.duration or 1.0
        for seg in segments:
            seg_text = apply_redaction(seg.text.strip())
            parts.append(seg_text)
            seg_data.append({"start": round(seg.start, 2), "end": round(seg.end, 2), "text": seg_text})
            hub.emit(
                "transcription_progress",
                {
                    "meeting_id": meeting_id,
                    "progress": min(0.99, seg.end / duration),
                },
            )
    text = "\n".join(p for p in parts if p)

    # Speaker diarization via silence-gap heuristic
    diarized = diarize_segments(seg_data)
    has_multiple_speakers = len({s.get("speaker") for s in diarized}) > 1

    if has_multiple_speakers:
        diarized_lines = []
        for seg in diarized:
            diarized_lines.append(f"{seg['speaker']}: {seg['text']}")
        diarized_text = "\n".join(diarized_lines)
    else:
        diarized_text = text

    out_path = TRANSCRIPTS_DIR / f"{meeting_id}.txt"
    write_secure_text(out_path, diarized_text)

    hub.emit("transcription_done", {"meeting_id": meeting_id})
    return {
        "text": diarized_text,
        "plain_text": text,
        "language": info.language,
        "duration_sec": info.duration,
        "segments": diarized,
        "has_diarization": has_multiple_speakers,
        "path": str(out_path),
    }


def _transcribe_ndarray(audio: np.ndarray) -> tuple[list[dict], str]:
    """Runs the real (accuracy) model on a raw 16 kHz mono float32 array with
    the same VAD settings as the whole-file pass above. Segment timestamps are
    relative to the start of `audio` — callers offset them onto the meeting
    timeline. Shared by the live incremental pass and the post-stop tail pass."""
    model = _load_model()
    with transcribe_lock:
        segments, info = model.transcribe(audio, vad_filter=True, vad_parameters=VAD_PARAMS)
        seg_data = [
            {
                "start": round(s.start, 2),
                "end": round(s.end, 2),
                "text": apply_redaction(s.text.strip()),
            }
            for s in segments
        ]
    return seg_data, info.language


def transcribe_array(audio: np.ndarray, offset: float = 0.0) -> list[dict]:
    """Background incremental pass (see recorder._incremental_transcribe_loop):
    transcribes one finalized block of the meeting while it's still recording,
    at full accuracy, so only a short tail is left to transcribe at stop time."""
    if not is_available() or len(audio) == 0:
        return []
    try:
        segs, _lang = _transcribe_ndarray(audio)
        for s in segs:
            s["start"] = round(s["start"] + offset, 2)
            s["end"] = round(s["end"] + offset, 2)
        return [s for s in segs if s["text"]]
    except Exception as exc:
        log.warning("Incremental block transcription failed: %s", exc)
        return []


def transcribe_tail(audio_path: Path, start_sec: float) -> dict:
    """Transcribes only the portion of the final WAV after `start_sec` — the
    fast path when a live incremental pass already covered everything before
    it. Returns {"segments": [...], "language": ...} in the same shape used
    to assemble a transcribe()-equivalent result (see pipeline.py)."""
    with wave.open(str(audio_path), "rb") as wf:
        sr = wf.getframerate()
        total_frames = wf.getnframes()
        start_frame = min(total_frames, max(0, int(start_sec * sr)))
        wf.setpos(start_frame)
        raw = wf.readframes(total_frames - start_frame)
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if not is_available() or len(audio) == 0:
        return {"segments": [], "language": None}
    segs, language = _transcribe_ndarray(audio)
    for s in segs:
        s["start"] = round(s["start"] + start_sec, 2)
        s["end"] = round(s["end"] + start_sec, 2)
    return {"segments": [s for s in segs if s["text"]], "language": language}


def finish_from_segments(
    meeting_id: str, segments: list[dict], language: str | None, duration_sec: float
) -> dict:
    """Builds the same result shape as transcribe(), from segments already
    assembled out of live incremental blocks plus a short tail pass, instead
    of running the model over the whole file. See pipeline._transcribe_fast."""
    hub.emit("transcription_started", {"meeting_id": meeting_id})
    diarized = diarize_segments(segments)
    has_multiple_speakers = len({s.get("speaker") for s in diarized}) > 1
    text = "\n".join(s["text"] for s in segments if s["text"])
    if has_multiple_speakers:
        diarized_text = "\n".join(f"{s['speaker']}: {s['text']}" for s in diarized)
    else:
        diarized_text = text

    out_path = TRANSCRIPTS_DIR / f"{meeting_id}.txt"
    write_secure_text(out_path, diarized_text)

    hub.emit("transcription_done", {"meeting_id": meeting_id})
    return {
        "text": diarized_text,
        "plain_text": text,
        "language": language or "en",
        "duration_sec": duration_sec,
        "segments": diarized,
        "has_diarization": has_multiple_speakers,
        "path": str(out_path),
    }

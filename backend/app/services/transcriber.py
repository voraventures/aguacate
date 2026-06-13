"""Local Whisper transcription via faster-whisper. Audio never leaves the device."""
import json
import logging
import re
import threading
from pathlib import Path

from ..config import TRANSCRIPTS_DIR, WHISPER_MODEL, write_secure_text
from ..db import get_setting
from ..events import hub

log = logging.getLogger("aguacate.transcriber")

_model = None
_model_lock = threading.Lock()
# faster-whisper transcribe() calls are serialized (coach + pipeline share the model)
transcribe_lock = threading.Lock()


def _load_model():
    global _model
    with _model_lock:
        if _model is None:
            from faster_whisper import WhisperModel

            size = get_setting("whisper_model", WHISPER_MODEL)
            log.info("Loading faster-whisper model %r", size)
            _model = WhisperModel(size, device="auto", compute_type="int8")
        return _model


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


def transcribe(meeting_id: str, audio_path: Path) -> dict:
    """Run Whisper on the wav, emitting progress events. Returns transcript info
    including timestamped segments (for Flagged Moments provenance)."""
    hub.emit("transcription_started", {"meeting_id": meeting_id})
    if not is_available():
        raise RuntimeError(
            "faster-whisper is not installed. Run: pip install faster-whisper"
        )
    model = _load_model()
    with transcribe_lock:
        segments, info = model.transcribe(str(audio_path), vad_filter=True)

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

    out_path = TRANSCRIPTS_DIR / f"{meeting_id}.txt"
    write_secure_text(out_path, text)

    hub.emit("transcription_done", {"meeting_id": meeting_id})
    return {
        "text": text,
        "language": info.language,
        "duration_sec": info.duration,
        "segments": seg_data,
        "path": str(out_path),
    }

"""Meeting-local acoustic clustering and conservative platform-name attribution."""
import json
import math
import threading
import time
import wave
import subprocess
import sys
from pathlib import Path
from bisect import bisect_left
from collections import defaultdict

import numpy as np

from ..db import get_db, get_setting
from ..events import hub
from . import speaker_models
from .transcriber import apply_redaction

_analysis_lock = threading.Lock()


def overlap(a, b, c, d):
    return max(0.0, min(b, d) - max(a, c))


def acoustic_turns(audio_path):
    # Isolate native runtime crashes/timeouts from the transcript/notes process.
    command = [sys.executable, '--speaker-worker', str(audio_path)] if getattr(sys, 'frozen', False) else [sys.executable, '-m', 'app.services.speaker_worker', str(audio_path)]
    completed = subprocess.run(command, cwd=str(Path(__file__).resolve().parents[2]), stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, timeout=7200, check=True)
    if len(completed.stdout) > 4_000_000:
        raise ValueError('Speaker result too large')
    return json.loads(completed.stdout)


def _acoustic_turns_in_process(audio_path):
    import sherpa_onnx as so
    if so.__version__ != "1.13.7":
        raise RuntimeError("Speaker runtime version mismatch")
    with wave.open(str(audio_path), "rb") as wav:
        if wav.getframerate() != 16000 or wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise ValueError("Expected 16kHz mono PCM")
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    if not len(samples) or not np.any(samples):
        return []
    config = so.OfflineSpeakerDiarizationConfig(
        segmentation=so.OfflineSpeakerSegmentationModelConfig(
            pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(speaker_models.MODEL_DIR / "segmentation.onnx")),
            num_threads=2, provider="cpu"),
        embedding=so.SpeakerEmbeddingExtractorConfig(model=str(speaker_models.MODEL_DIR / "embedding.onnx"), num_threads=2, provider="cpu"),
        clustering=so.FastClusteringConfig(num_clusters=-1, threshold=0.5),
        min_duration_on=0.3, min_duration_off=0.5,
    )
    if not config.validate():
        raise ValueError("Invalid speaker model configuration")
    engine = so.OfflineSpeakerDiarization(config)
    turns = engine.process(samples).sort_by_start_time()
    # Stable within a meeting, numbered in order of first occurrence.
    ids = {}
    result = []
    for turn in turns:
        ids.setdefault(turn.speaker, f"speaker_{len(ids) + 1}")
        if math.isfinite(turn.start) and math.isfinite(turn.end) and turn.end > turn.start:
            result.append({"start": turn.start, "end": turn.end, "speaker_id": ids[turn.speaker]})
    return result


def resolve_names(turns, events):
    """Activity snapshots expire quickly; ambiguous/contradictory evidence abstains.

    This is evidence scoring, not a calibrated identity probability. No names
    are inferred from calendars, transcript content, or a prior meeting.
    """
    intervals = []
    for current, following in zip(events, events[1:]):
        if current.get('connection', 'connected') != 'connected' or following.get('connection', 'connected') != 'connected':
            continue
        people = current["participants"]
        if len(people) != 1 or following["audio_time"] - current["audio_time"] > 0.8:
            continue
        person = people[0]
        if following["source"] != current["source"] or not any(p["id"] == person["id"] for p in following["participants"]):
            continue
        intervals.append((current["audio_time"], following["audio_time"], current["source"], person))
    votes, lengths, names = defaultdict(lambda: defaultdict(float)), defaultdict(float), {}
    interval_ends = [item[1] for item in intervals]
    for turn in turns:
        sid = turn["speaker_id"]
        lengths[sid] += turn["end"] - turn["start"]
        overlapping_turns = [other for other in turns if other['speaker_id'] != sid and overlap(turn['start'], turn['end'], other['start'], other['end']) > 0]
        for a, b, source, person in intervals[bisect_left(interval_ends, turn['start']):]:
            if a >= turn['end']:
                break
            if b <= turn['start']:
                continue
            # An overlapping voice cannot safely inherit the active-speaker name.
            if any(overlap(max(a, turn["start"]), min(b, turn["end"]), other["start"], other["end"]) > 0 for other in overlapping_turns):
                continue
            key = (source, person["id"])
            votes[sid][key] += overlap(turn["start"], turn["end"], a, b)
            names[key] = person["name"]
    resolved = {}
    for sid, counts in votes.items():
        ranked = sorted(counts.items(), key=lambda v: v[1], reverse=True)
        (key, evidence) = ranked[0]
        other = sum(counts.values()) - evidence
        if evidence >= 2 and evidence >= 0.3 * lengths[sid] and other < 0.5 and evidence >= 0.9 * sum(counts.values()):
            resolved[sid] = {"name": names[key], "source": key[0], "participant_id": key[1]}
    return resolved


def align_words(segments, turns, names):
    output = []
    for segment in segments:
        words = segment.get("words") or [{"start": segment["start"], "end": segment["end"], "word": " " + segment["text"]}]
        for word in words:
            text = word.get("word", "")
            if not text:
                continue
            start, end = word["start"], word["end"]
            scores = defaultdict(float)
            for turn in turns:
                scores[turn["speaker_id"]] += overlap(start, end, turn["start"], turn["end"])
            ranked = sorted(scores.items(), key=lambda v: v[1], reverse=True)
            sid = None
            if end > start and ranked and ranked[0][1] >= (end - start) * 0.5 and (len(ranked) == 1 or ranked[1][1] < (end - start) * 0.2):
                sid = ranked[0][0]
            # Missing word alignment spanning multiple turns must not guess.
            if not segment.get("words") and sum(v > 0 for v in scores.values()) > 1:
                sid = None
            identity = names.get(sid, {})
            generic = f"Speaker {sid.split('_')[-1]}" if sid else "Speaker"
            name = identity.get("name")
            label = name or generic
            if name and sum(n["name"] == name for n in names.values()) > 1:
                label = f"{name} ({generic})"
            if output and output[-1]["speaker_id"] == sid and output[-1]["speaker"] == label and start - output[-1]["end"] < 1.5:
                output[-1]["text"] += text
                output[-1]["end"] = end
            else:
                output.append({"start": start, "end": end, "text": text, "speaker_id": sid, "speaker": label,
                               "speaker_name": name, "speaker_source": identity.get("source", "acoustic" if sid else "unknown")})
    for item in output:
        item["text"] = item["text"].strip()
    return output


def analyze(meeting_id, audio_path, result):
    result["speaker_analysis"] = {"status": "disabled", "version": speaker_models.VERSION}
    if not get_setting("speaker_identification", False):
        return result
    started = time.monotonic()
    if not speaker_models.ready():
        result["speaker_analysis"]["status"] = "models_missing"
        return result
    hub.emit("speaker_analysis", {"meeting_id": meeting_id, "status": "processing"})
    try:
        with _analysis_lock:
            turns = acoustic_turns(audio_path)
        rows = get_db().execute("SELECT audio_time, source, participants, connection FROM speaker_events WHERE meeting_id=? ORDER BY sequence", (meeting_id,)).fetchall()
        events = [{**dict(row), "participants": json.loads(row["participants"])} for row in rows]
        for event in events:
            for person in event['participants']:
                person['name'] = apply_redaction(person['name'])
        names = resolve_names(turns, events)
        segments = align_words(result["segments"], turns, names)
        if not segments and result.get("text", "").strip():
            raise ValueError("Missing alignment")
        result["segments"] = segments
        result['has_diarization'] = bool(turns)
        result["text"] = "\n".join(f"{s['speaker']}: {s['text']}" for s in segments)
        result["speaker_analysis"] = {"status": "ready", "version": speaker_models.VERSION,
                                      "named_speakers": len(names), "speakers": len({t['speaker_id'] for t in turns}),
                                      "duration_sec": round(time.monotonic() - started, 2)}
    except Exception:
        result["speaker_analysis"]["status"] = "failed"
    hub.emit("speaker_analysis", {"meeting_id": meeting_id, **result["speaker_analysis"]})
    return result

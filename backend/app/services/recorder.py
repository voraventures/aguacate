"""Audio capture, cross-platform.

macOS:   microphone via sounddevice/CoreAudio + optional loopback device
         (BlackHole/aggregate) for system audio.
Windows: microphone via sounddevice/WASAPI + native WASAPI loopback of any
         output device via the `soundcard` package (no driver needed).

Streams are captured at each device's native rate, then resampled to 16 kHz
mono and mixed at stop time. Output WAV is 0600 from creation.
"""
import logging
import sys
import threading
import wave
from pathlib import Path

import numpy as np

from ..config import RECORDINGS_DIR, secure_file, touch_secure
from ..events import hub

log = logging.getLogger("aguacate.recorder")

TARGET_SR = 16000
IS_WINDOWS = sys.platform == "win32"

# Synthetic device indices >= WASAPI_BASE refer to Windows loopback captures.
WASAPI_BASE = 1000
_wasapi_devices: dict[int, str] = {}  # synthetic index -> soundcard mic id

try:
    import sounddevice as sd

    AUDIO_AVAILABLE = True
except Exception as exc:  # pragma: no cover - missing PortAudio
    sd = None
    AUDIO_AVAILABLE = False
    log.warning("sounddevice unavailable: %s", exc)

sc = None
if IS_WINDOWS:  # pragma: no cover - windows only
    try:
        import soundcard as sc  # WASAPI loopback
    except Exception as exc:
        log.warning("soundcard (WASAPI loopback) unavailable: %s", exc)


def _list_wasapi_loopbacks() -> list[dict]:
    """Windows: every output device exposed as a recordable loopback input."""
    if not (IS_WINDOWS and sc):
        return []
    out = []
    _wasapi_devices.clear()
    try:
        loopbacks = [m for m in sc.all_microphones(include_loopback=True) if m.isloopback]
    except Exception as exc:  # pragma: no cover
        log.warning("WASAPI loopback enumeration failed: %s", exc)
        return []
    for i, mic in enumerate(loopbacks):
        idx = WASAPI_BASE + i
        _wasapi_devices[idx] = str(mic.id)
        out.append(
            {
                "index": idx,
                "name": f"{mic.name} (loopback)",
                "channels": 2,
                "default_samplerate": 48000,
                "is_loopback_like": True,
            }
        )
    return out


def list_input_devices() -> list[dict]:
    devices = []
    if AUDIO_AVAILABLE:
        for idx, dev in enumerate(sd.query_devices()):
            if dev.get("max_input_channels", 0) > 0:
                devices.append(
                    {
                        "index": idx,
                        "name": dev["name"],
                        "channels": dev["max_input_channels"],
                        "default_samplerate": dev["default_samplerate"],
                        "is_loopback_like": any(
                            k in dev["name"].lower()
                            for k in ("blackhole", "loopback", "aggregate", "soundflower")
                        ),
                    }
                )
    devices.extend(_list_wasapi_loopbacks())
    return devices


class _DeviceCapture:
    def __init__(self, device_index: int | None):
        self.device_index = device_index
        self.chunks: list[np.ndarray] = []
        self.samplerate = TARGET_SR
        self.stream = None

    def start(self):
        info = sd.query_devices(self.device_index, "input")
        self.samplerate = int(info["default_samplerate"])
        channels = min(2, max(1, info["max_input_channels"]))

        def callback(indata, frames, time_info, status):
            if recorder.muted:
                # privacy mute zone: keep the timeline, drop the content
                self.chunks.append(np.zeros_like(indata))
            else:
                self.chunks.append(indata.copy())

        self.stream = sd.InputStream(
            device=self.device_index,
            channels=channels,
            samplerate=self.samplerate,
            dtype="float32",
            callback=callback,
        )
        self.stream.start()

    def stop(self) -> np.ndarray:
        if self.stream:
            self.stream.stop()
            self.stream.close()
        if not self.chunks:
            return np.zeros(0, dtype=np.float32)
        audio = np.concatenate(self.chunks, axis=0)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)  # downmix to mono
        if self.samplerate != TARGET_SR:
            audio = _resample(audio, self.samplerate, TARGET_SR)
        return audio


class _WasapiLoopbackCapture:
    """Windows system-audio capture through soundcard's WASAPI loopback."""

    def __init__(self, synthetic_index: int):
        if synthetic_index not in _wasapi_devices:
            _list_wasapi_loopbacks()  # refresh mapping (device list may be stale)
        mic_id = _wasapi_devices.get(synthetic_index)
        if mic_id is None or sc is None:
            raise RuntimeError(
                "System audio device not found — re-select it in Settings → Recording"
            )
        self._mic = sc.get_microphone(mic_id, include_loopback=True)
        self.samplerate = 48000
        self.chunks: list[np.ndarray] = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self):
        def run():
            try:
                with self._mic.recorder(samplerate=self.samplerate, channels=2) as rec:
                    while not self._stop.is_set():
                        data = rec.record(numframes=self.samplerate // 10)
                        self.chunks.append(np.asarray(data, dtype=np.float32))
            except Exception as exc:  # pragma: no cover
                log.error("WASAPI loopback capture failed: %s", exc)

        self._thread = threading.Thread(target=run, daemon=True)
        self._thread.start()

    def stop(self) -> np.ndarray:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)
        if not self.chunks:
            return np.zeros(0, dtype=np.float32)
        audio = np.concatenate(self.chunks, axis=0)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        return _resample(audio, self.samplerate, TARGET_SR)


def _make_capture(device_index: int | None):
    if device_index is not None and device_index >= WASAPI_BASE:
        return _WasapiLoopbackCapture(device_index)
    return _DeviceCapture(device_index)


def _resample(audio: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    if src_sr == dst_sr or len(audio) == 0:
        return audio
    duration = len(audio) / src_sr
    n_out = int(duration * dst_sr)
    x_old = np.linspace(0, duration, num=len(audio), endpoint=False)
    x_new = np.linspace(0, duration, num=n_out, endpoint=False)
    return np.interp(x_new, x_old, audio).astype(np.float32)


class Recorder:
    """Singleton recorder managing one active recording at a time."""

    def __init__(self):
        self._lock = threading.Lock()
        self._captures: list[_DeviceCapture] = []
        self._meeting_id: str | None = None
        self._level_thread: threading.Thread | None = None
        self._stop_levels = threading.Event()
        self._started_at: float | None = None
        self.muted = False           # privacy mute zone: capture writes silence
        self.markers: list[float] = []  # flagged moments, seconds from start

    @property
    def elapsed(self) -> float:
        import time

        return time.monotonic() - self._started_at if self._started_at else 0.0

    def set_muted(self, muted: bool) -> None:
        self.muted = muted
        hub.emit("recording_muted", {"muted": muted})

    def add_marker(self) -> float | None:
        if self._meeting_id is None:
            return None
        t = self.elapsed
        self.markers.append(round(t, 1))
        hub.emit("marker_added", {"at": round(t, 1), "count": len(self.markers)})
        return t

    def drain_for_coach(self, cursor: dict) -> np.ndarray:
        """Return new 16k mono audio (mic capture only) since the last call.
        cursor is caller-owned state: {"chunk_index": int}."""
        if not self._captures:
            return np.zeros(0, dtype=np.float32)
        cap = self._captures[0]
        start = cursor.get("chunk_index", 0)
        chunks = cap.chunks[start:]
        cursor["chunk_index"] = start + len(chunks)
        if not chunks:
            return np.zeros(0, dtype=np.float32)
        audio = np.concatenate(chunks, axis=0)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        return _resample(audio, cap.samplerate, TARGET_SR)

    @property
    def is_recording(self) -> bool:
        return self._meeting_id is not None

    @property
    def meeting_id(self) -> str | None:
        return self._meeting_id

    def start(self, meeting_id: str, mic_device: int | None, system_device: int | None) -> None:
        if not AUDIO_AVAILABLE:
            raise RuntimeError("Audio capture is unavailable on this system")
        with self._lock:
            if self._meeting_id is not None:
                raise RuntimeError("A recording is already in progress")
            self._captures = []
            try:
                mic = _make_capture(mic_device)
                mic.start()
                self._captures.append(mic)
                if system_device is not None and system_device != mic_device:
                    sys_cap = _make_capture(system_device)
                    sys_cap.start()
                    self._captures.append(sys_cap)
            except Exception:
                for c in self._captures:
                    try:
                        c.stop()
                    except Exception:
                        pass
                self._captures = []
                raise
            self._meeting_id = meeting_id
            import time

            self._started_at = time.monotonic()
            self.muted = False
            self.markers = []
            self._stop_levels.clear()
            self._level_thread = threading.Thread(target=self._emit_levels, daemon=True)
            self._level_thread.start()
            hub.emit("recording_started", {"meeting_id": meeting_id})

    def _emit_levels(self):
        """Emit RMS levels ~4x/sec so the UI waveform animates with real audio."""
        while not self._stop_levels.wait(0.25):
            try:
                cap = self._captures[0] if self._captures else None
                if cap and cap.chunks:
                    recent = cap.chunks[-1]
                    rms = float(np.sqrt(np.mean(np.square(recent))))
                    hub.emit("recording_level", {"rms": min(1.0, rms * 8)})
            except Exception:
                pass

    def stop(self) -> Path:
        with self._lock:
            if self._meeting_id is None:
                raise RuntimeError("No recording in progress")
            meeting_id = self._meeting_id
            self._stop_levels.set()
            tracks = [c.stop() for c in self._captures]
            self._captures = []
            self._meeting_id = None
            self._started_at = None
            self.muted = False

        tracks = [t for t in tracks if len(t) > 0]
        if tracks:
            length = max(len(t) for t in tracks)
            mixed = np.zeros(length, dtype=np.float32)
            for t in tracks:
                mixed[: len(t)] += t
            peak = np.max(np.abs(mixed)) or 1.0
            if peak > 1.0:
                mixed /= peak
        else:
            mixed = np.zeros(TARGET_SR, dtype=np.float32)  # 1s silence placeholder

        path = RECORDINGS_DIR / f"{meeting_id}.wav"
        touch_secure(path)  # 0600 before any audio bytes land (C5)
        pcm = (mixed * 32767).astype(np.int16)
        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(TARGET_SR)
            wf.writeframes(pcm.tobytes())
        secure_file(path)
        hub.emit("recording_stopped", {"meeting_id": meeting_id, "path": str(path)})
        return path


recorder = Recorder()

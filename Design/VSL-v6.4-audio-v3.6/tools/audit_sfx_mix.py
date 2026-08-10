#!/usr/bin/env python3
"""Measure the v3.3 SFX/ambience files against their runtime gain contract."""

from __future__ import annotations

import json
import math
import wave
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "assets" / "runtime" / "audio"
REPORT = ROOT / "sound" / "SFX-MIX-AUDIT-v3.4.json"


def db(value: float) -> float:
    return 20.0 * math.log10(max(value, 1e-12))


def read_wav(path: Path) -> tuple[np.ndarray, int, int]:
    with wave.open(str(path), "rb") as handle:
        channels = handle.getnchannels()
        rate = handle.getframerate()
        frames = handle.getnframes()
        raw = handle.readframes(frames)
    signal = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    signal = signal.reshape(-1, channels).mean(axis=1)
    return signal, rate, channels


def main() -> None:
    sound = json.loads((ROOT / "sound" / "sound.json").read_text(encoding="utf-8"))
    master = float(sound["buses"]["master"]["default"])
    bgm = float(sound["buses"]["bgm"]["default"])
    sfx_bus = float(sound["buses"]["sfx"]["default"])
    rows = []
    errors = []

    for cue in sound["sfx"]:
        loop = bool(cue.get("loop"))
        folder = "ambience" if loop else "sfx"
        path = AUDIO / folder / f"{cue['id']}.wav"
        if not path.exists():
            errors.append(f"missing:{cue['id']}")
            continue
        signal, rate, channels = read_wav(path)
        duration = len(signal) / rate
        peak = float(np.max(np.abs(signal)))
        rms = float(np.sqrt(np.mean(signal * signal)))
        window = signal[::2]
        spectrum = np.abs(np.fft.rfft(window)) ** 2
        freqs = np.fft.rfftfreq(len(window), d=2 / rate)
        hf_ratio = float(spectrum[freqs >= 6000].sum() / max(spectrum.sum(), 1e-12))
        bus = bgm if loop else sfx_bus
        runtime_peak = db(peak) + float(cue.get("gain", 0)) + db(master * bus)
        row = {
            "id": cue["id"],
            "group": cue.get("group"),
            "loop": loop,
            "durationSec": round(duration, 4),
            "channels": channels,
            "filePeakDbfs": round(db(peak), 2),
            "fileRmsDbfs": round(db(rms), 2),
            "runtimePeakDbfsAtDefaults": round(runtime_peak, 2),
            "highFrequencyEnergyRatio": round(hf_ratio, 5),
        }
        rows.append(row)
        if rate != 44_100:
            errors.append(f"sample-rate:{cue['id']}:{rate}")
        if channels != (2 if loop else 1):
            errors.append(f"channels:{cue['id']}:{channels}")
        if abs(duration - float(cue["durationSec"])) > 0.002:
            errors.append(f"duration:{cue['id']}:{duration:.4f}")
        if runtime_peak > -7.5:
            errors.append(f"runtime-peak:{cue['id']}:{runtime_peak:.2f}")

    report = {
        "schemaVersion": "sfx-mix-audit-3.4",
        "soundVersion": sound["version"],
        "cueCount": len(rows),
        "errors": errors,
        "summary": {
            "loudestRuntimePeakDbfs": max(row["runtimePeakDbfsAtDefaults"] for row in rows),
            "highestHighFrequencyEnergyRatio": max(row["highFrequencyEnergyRatio"] for row in rows),
            "ambienceCount": sum(row["loop"] for row in rows),
            "sfxCount": sum(not row["loop"] for row in rows),
        },
        "topRuntimePeaks": sorted(rows, key=lambda row: row["runtimePeakDbfsAtDefaults"], reverse=True)[:12],
        "topHighFrequency": sorted(rows, key=lambda row: row["highFrequencyEnergyRatio"], reverse=True)[:12],
        "cues": rows,
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False))
    print(f"CUES={len(rows)} ERRORS={len(errors)} REPORT={REPORT}")
    if errors:
        raise SystemExit("\n".join(errors))


if __name__ == "__main__":
    main()

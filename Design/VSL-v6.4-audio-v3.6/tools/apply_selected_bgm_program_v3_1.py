#!/usr/bin/env python3
"""Build the seven-track selected-source BGM program without regressing Audio v3.3 SFX.

The script keeps the existing 21 logical BGM IDs and 33 runtime slots so the
game/VSL contract remains stable.  Seven musical sources are edited into short,
level-matched seamless loops, then reused by scene family.  Adaptive L2/L3
slots are intentionally silent: the selected stereo master already contains a
complete mix, and summing duplicate full mixes would create comb filtering and
level jumps.

Run with the bundled Codex Python 3.12 after installing miniaudio and numpy in
tools/_vendor.  All project paths are resolved relative to this file.
"""

from __future__ import annotations

import json
import math
import runpy
import sys
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "tools" / "_vendor"
sys.path.insert(0, str(VENDOR))

try:
    import miniaudio
    import numpy as np
except ImportError as exc:  # pragma: no cover - operator-facing diagnostic
    raise SystemExit(
        "Missing audio dependencies. Install miniaudio and numpy into tools/_vendor "
        "with Python 3.12 before running this script."
    ) from exc


SAMPLE_RATE = 44_100
CHANNELS = 2
LOOP_SECONDS = 36.0
LOOP_CROSSFADE_SECONDS = 3.5
INTRO_SECONDS = 12.0
TARGET_RMS_DBFS = -22.5
PEAK_CEILING_DBFS = -1.5
CITY_SOURCE_OFFSET_SECONDS = 60.0
CITY_PLAYBACK_RATIO = 1.07
MERCHANT_SOURCE_OFFSET_SECONDS = 42.0
MERCHANT_PLAYBACK_RATIO = 1.025
EXCHANGE_SOURCE_OFFSET_SECONDS = 54.0
GUILD_SOURCE_OFFSET_SECONDS = 18.0
RELIC_BOSS_SOURCE_OFFSET_SECONDS = 34.0
RELIC_BOSS_PLAYBACK_RATIO = 0.965

SOURCE_DIR = ROOT / "sound" / "source-bgm"
MASTER_DIR = SOURCE_DIR / "processed-masters"
RUNTIME_BGM_DIR = ROOT / "assets" / "runtime" / "audio" / "bgm"
SOUND_JSON = ROOT / "sound" / "sound.json"
RUNTIME_JS = ROOT / "assets" / "runtime" / "audio" / "sound-runtime.js"


PROGRAM = {
    "01_title": {
        "file": "01_title_blue_harbor_ledger.wav",
        "title": "Blue Harbor Ledger",
        "author": "User-provided source",
        "license": "User-provided; rights confirmation required before public release",
        "sourcePage": None,
        "role": "타이틀 · 이어하기",
        "ids": ["bgm-01-title"],
    },
    "02_city": {
        "file": "02_city_thatched_villagers.mp3",
        "title": "Thatched Villagers",
        "author": "Kevin MacLeod",
        "license": "Creative Commons Attribution 4.0",
        "sourcePage": "https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100720",
        "role": "도시 · 성장 · 마감",
        "ids": ["bgm-02-city", "bgm-08-city-growth", "bgm-09-city-deadline"],
        "editProfile": "v3.6 bright city refit: active middle passage, +7% playback ratio, clear acoustic midrange, restrained melody",
    },
    "03_workplace": {
        "file": "03_workplace_march_of_the_spoons.mp3",
        "title": "March of the Spoons",
        "author": "Kevin MacLeod",
        "license": "Creative Commons Attribution 4.0",
        "sourcePage": "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700008",
        "role": "로딩 · 의뢰소",
        "ids": [
            "bgm-07-loading-workshop",
            "bgm-10-office-appraisal",
        ],
    },
    "04_tavern_guild": {
        "file": "04_tavern_midnight_tale.mp3",
        "title": "Midnight Tale",
        "author": "Kevin MacLeod",
        "license": "Creative Commons Attribution 4.0",
        "sourcePage": "https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1900004",
        "role": "술집 · 정보 거래",
        "ids": ["bgm-11-tavern-whispers"],
    },
    "05_auction": {
        "file": "05_auction_i_knew_a_guy.mp3",
        "title": "I Knew a Guy",
        "author": "Kevin MacLeod",
        "license": "Creative Commons Attribution 4.0",
        "sourcePage": "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100199",
        "role": "일반 경매 전 구간",
        "ids": ["bgm-03-auction", "bgm-15-auction-noir", "bgm-16-auction-pressure"],
    },
    "06_relic_boss": {
        "file": "05_auction_i_knew_a_guy.mp3",
        "title": "I Knew a Guy — Relic Boss Reprise",
        "author": "Kevin MacLeod",
        "license": "Creative Commons Attribution 4.0",
        "sourcePage": "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100199",
        "role": "유물 경매 · 일반 경매 모티프의 보스 변주",
        "ids": ["bgm-04-relic"],
        "editProfile": "v3.6 relic boss: auction motif, slower low register, wider hall, sparse low drum pulse",
    },
    "07_settlement_result": {
        "file": "07_settlement_peaceful_desolation.mp3",
        "title": "Peaceful Desolation",
        "author": "Kevin MacLeod",
        "license": "Creative Commons Attribution 4.0",
        "sourcePage": "https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1200017",
        "role": "결산 · 엔딩 판정 · 결과 · 전시관",
        "ids": [
            "bgm-05-settlement",
            "bgm-17-settlement-loss",
            "bgm-18-ending-verdict",
            "bgm-19-result-success",
            "bgm-20-result-bankruptcy",
            "bgm-21-museum-memory",
        ],
    },
    "08_merchant_reprise": {
        "file": "01_title_blue_harbor_ledger.wav",
        "title": "Blue Harbor Ledger — Merchant Reprise",
        "author": "User-provided source",
        "license": "User-provided; rights confirmation required before public release",
        "sourcePage": None,
        "role": "상회 · 플레이어 본거점",
        "ids": ["bgm-06-archive"],
        "editProfile": "v3.6 merchant reprise: alternate middle passage, +2.5% movement, closer wood-and-brass room",
    },
    "09_exchange": {
        "file": "03_workplace_march_of_the_spoons.mp3",
        "title": "March of the Spoons — Exchange Cut",
        "author": "Kevin MacLeod",
        "license": "Creative Commons Attribution 4.0",
        "sourcePage": "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1700008",
        "role": "거래소 · 주판과 저울의 작업 리듬",
        "ids": ["bgm-12-exchange-ledger", "bgm-14-merchant-workshop"],
        "editProfile": "v3.6 exchange cut: active alternate passage, compact stereo, dry working rhythm",
    },
    "10_guild_chamber": {
        "file": "06_relic_court_of_the_queen.mp3",
        "title": "Court of the Queen — Guild Chamber",
        "author": "Kevin MacLeod",
        "license": "Creative Commons Attribution 4.0",
        "sourcePage": "https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100728",
        "role": "중개인 조합 · 계약과 담보의 격식",
        "ids": ["bgm-13-guild-vault"],
        "editProfile": "v3.6 guild chamber: formal chamber-waltz source reassigned from relic auction",
    },
}


def decode_source(path: Path) -> np.ndarray:
    decoded = miniaudio.decode(
        path.read_bytes(),
        output_format=miniaudio.SampleFormat.FLOAT32,
        nchannels=CHANNELS,
        sample_rate=SAMPLE_RATE,
    )
    return np.asarray(decoded.samples, dtype=np.float32).reshape(-1, CHANNELS).copy()


def trim_silence(audio: np.ndarray, threshold: float = 5e-4) -> np.ndarray:
    frame_peak = np.max(np.abs(audio), axis=1)
    active = np.flatnonzero(frame_peak >= threshold)
    if not active.size:
        return audio
    margin = int(0.2 * SAMPLE_RATE)
    start = max(0, int(active[0]) - margin)
    end = min(len(audio), int(active[-1]) + margin + 1)
    return audio[start:end]


def normalize(audio: np.ndarray) -> np.ndarray:
    rms = float(np.sqrt(np.mean(np.square(audio, dtype=np.float64))))
    peak = float(np.max(np.abs(audio)))
    if rms <= 1e-9 or peak <= 1e-9:
        return audio
    target_rms = 10.0 ** (TARGET_RMS_DBFS / 20.0)
    peak_ceiling = 10.0 ** (PEAK_CEILING_DBFS / 20.0)
    gain = min(target_rms / rms, peak_ceiling / peak)
    return np.asarray(audio * gain, dtype=np.float32)


def select_loop_region(audio: np.ndarray, offset_seconds: float | None = None) -> np.ndarray:
    fade = int(LOOP_CROSSFADE_SECONDS * SAMPLE_RATE)
    target = int(LOOP_SECONDS * SAMPLE_RATE)
    needed = target + fade
    if len(audio) < needed:
        repeats = math.ceil(needed / len(audio))
        audio = np.tile(audio, (repeats, 1))

    # Skip a short opening gesture when possible; it remains represented in the
    # dedicated intro slot for title/relic and is less likely to reveal the loop.
    requested_offset = 4.0 if offset_seconds is None else max(0.0, offset_seconds)
    safe_offset = min(int(requested_offset * SAMPLE_RATE), max(0, len(audio) - needed))
    region = audio[safe_offset : safe_offset + needed]
    body = region[fade:target]
    tail = region[target : target + fade]
    head = region[:fade]
    curve = np.linspace(0.0, 1.0, fade, endpoint=False, dtype=np.float32)[:, None]
    blend = tail * (1.0 - curve) + head * curve
    return np.concatenate((body, blend), axis=0)


def resample_color(loop: np.ndarray, ratio: float) -> np.ndarray:
    """Change perceived pace and pitch while keeping the fixed loop duration."""
    count = len(loop)
    source_positions = np.arange(count, dtype=np.float64) * ratio
    source_positions = np.mod(source_positions, count - 1)
    left = np.floor(source_positions).astype(np.int64)
    right = np.minimum(left + 1, count - 1)
    fraction = (source_positions - left).astype(np.float32)[:, None]
    return loop[left] * (1.0 - fraction) + loop[right] * fraction


def spectral_tilt(audio: np.ndarray, points: list[float], gains: list[float]) -> np.ndarray:
    count = len(audio)
    frequencies = np.fft.rfftfreq(count, d=1.0 / SAMPLE_RATE)
    eq = np.interp(frequencies, points, gains).astype(np.float32)
    result = audio.copy()
    for channel in range(CHANNELS):
        spectrum = np.fft.rfft(result[:, channel])
        result[:, channel] = np.fft.irfft(spectrum * eq, n=count).astype(np.float32)
    return result


def seal_loop(audio: np.ndarray) -> np.ndarray:
    result = audio.copy()
    fade = int(LOOP_CROSSFADE_SECONDS * SAMPLE_RATE)
    curve = np.linspace(0.0, 1.0, fade, endpoint=False, dtype=np.float32)[:, None]
    result[-fade:] = result[-fade:] * (1.0 - curve) + result[:fade] * curve
    return normalize(result)


def city_bright_refit(loop: np.ndarray) -> np.ndarray:
    """Content1 기준: 밝고 빠르되 가볍거나 코믹해지지 않는 도시 운영 루프."""
    bright = resample_color(loop, CITY_PLAYBACK_RATIO)

    # 중심은 안정시키고 항구 지도 화면에 필요한 좌우 공기만 남긴다.
    mid = bright.mean(axis=1)
    side = (bright[:, 0] - bright[:, 1]) * 0.5
    bright[:, 0] = mid + side * 0.84
    bright[:, 1] = mid - side * 0.84

    bright = spectral_tilt(
        bright,
        [0, 110, 260, 900, 2200, 5000, 9000, SAMPLE_RATE / 2],
        [1.00, 1.04, 1.06, 1.04, 1.01, 0.92, 0.74, 0.55],
    )
    bright = np.tanh(bright * 1.06).astype(np.float32) / np.tanh(1.06)
    return seal_loop(bright)


def merchant_reprise_refit(loop: np.ndarray) -> np.ndarray:
    reprise = resample_color(loop, MERCHANT_PLAYBACK_RATIO)
    mid = reprise.mean(axis=1)
    side = (reprise[:, 0] - reprise[:, 1]) * 0.5
    reprise[:, 0] = mid + side * 0.72
    reprise[:, 1] = mid - side * 0.72
    reprise = spectral_tilt(
        reprise,
        [0, 120, 320, 1200, 3600, 8000, SAMPLE_RATE / 2],
        [0.94, 1.05, 1.08, 1.04, 0.88, 0.62, 0.44],
    )
    return seal_loop(reprise)


def exchange_refit(loop: np.ndarray) -> np.ndarray:
    working = resample_color(loop, 1.035)
    mid = working.mean(axis=1)
    side = (working[:, 0] - working[:, 1]) * 0.5
    working[:, 0] = mid + side * 0.68
    working[:, 1] = mid - side * 0.68
    working = spectral_tilt(
        working,
        [0, 130, 420, 1500, 4200, 9000, SAMPLE_RATE / 2],
        [0.92, 1.03, 1.08, 1.02, 0.82, 0.56, 0.38],
    )
    return seal_loop(working)


def relic_boss_refit(loop: np.ndarray) -> np.ndarray:
    """일반 경매 모티프를 유지하고 공간·저역·박동만 보스전 규모로 확장한다."""
    boss = resample_color(loop, RELIC_BOSS_PLAYBACK_RATIO)
    mid = boss.mean(axis=1)
    side = (boss[:, 0] - boss[:, 1]) * 0.5
    boss[:, 0] = mid + side * 1.14
    boss[:, 1] = mid - side * 1.14
    boss = spectral_tilt(
        boss,
        [0, 75, 180, 520, 1700, 4200, 9000, SAMPLE_RATE / 2],
        [1.08, 1.18, 1.16, 1.08, 0.98, 0.82, 0.60, 0.42],
    )

    # 같은 연주의 짧은 반사를 사용해 별도 작곡 없이 큰 홀의 규모만 만든다.
    hall = boss.copy()
    for delay_seconds, gain in ((0.115, 0.15), (0.235, 0.10), (0.410, 0.065)):
        delay = int(delay_seconds * SAMPLE_RATE)
        hall[delay:] += boss[:-delay] * gain

    # 4박마다 낮은 프레임 드럼에 가까운 비음정 펄스를 아주 작게 추가한다.
    pulse_interval = int((60.0 / 86.0) * 4.0 * SAMPLE_RATE)
    pulse_length = int(0.42 * SAMPLE_RATE)
    t = np.arange(pulse_length, dtype=np.float32) / SAMPLE_RATE
    envelope = np.exp(-t * 10.5).astype(np.float32)
    pulse = (np.sin(2.0 * np.pi * 52.0 * t) + 0.36 * np.sin(2.0 * np.pi * 78.0 * t)) * envelope * 0.018
    for start in range(int(1.4 * SAMPLE_RATE), len(hall) - pulse_length, pulse_interval):
        hall[start:start + pulse_length, 0] += pulse
        hall[start:start + pulse_length, 1] += pulse
    hall = np.tanh(hall * 1.08).astype(np.float32) / np.tanh(1.08)
    return seal_loop(hall)


def make_intro(audio: np.ndarray) -> np.ndarray:
    count = min(len(audio), int(INTRO_SECONDS * SAMPLE_RATE))
    intro = audio[:count].copy()
    fade_in = min(len(intro), int(0.25 * SAMPLE_RATE))
    fade_out = min(len(intro), int(1.2 * SAMPLE_RATE))
    if fade_in:
        intro[:fade_in] *= np.linspace(0.0, 1.0, fade_in, endpoint=False, dtype=np.float32)[:, None]
    if fade_out:
        intro[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, endpoint=True, dtype=np.float32)[:, None]
    return intro


def write_wav(path: Path, audio: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(np.rint(audio * 32767.0), -32768, 32767).astype("<i2")
    with wave.open(str(path), "wb") as out:
        out.setnchannels(CHANNELS)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(pcm.tobytes())


def slot_paths_for(track: dict) -> list[tuple[str, bool]]:
    track_id = track["id"]
    slots: list[tuple[str, bool]] = []
    if track.get("structure", {}).get("intro"):
        slots.append((f"{track_id}__intro.wav", True))
    layers = track.get("layers") or []
    if layers:
        for index, layer in enumerate(layers):
            slots.append((f"{track_id}__{layer['id']}.wav", index > 0))
    else:
        slots.append((f"{track_id}__loop.wav", False))
    return slots


def apply_contract_metadata(data: dict) -> dict:
    assignment = {
        bgm_id: (program_id, entry)
        for program_id, entry in PROGRAM.items()
        for bgm_id in entry["ids"]
    }
    for track in data["bgm"]:
        program_id, entry = assignment[track["id"]]
        track["selectedSource"] = {
            "programId": program_id,
            "title": entry["title"],
            "author": entry["author"],
            "license": entry["license"],
            "sourcePage": entry["sourcePage"],
        }
        if entry.get("editProfile"):
            track["selectedSource"]["editProfile"] = entry["editProfile"]
            track["notes"] = (
                f"Audio v3.6 scene-role refit: {entry['title']} · 36초 루프. "
                f"{entry['editProfile']}"
            )
        else:
            track["notes"] = (
                f"Audio v3.2 selected-source edit: {entry['title']} · "
                "36초 레벨 매칭 루프. 완성 믹스 보호를 위해 추가 적응 레이어는 무음 슬롯으로 유지."
            )

    track_updates = {
        "bgm-02-city": {
            "name": "푸른 항구의 장날",
            "character": "밝은 섬 항구 도시를 오래 돌아다녀도 피로하지 않게 미는 성숙한 운영 실내악. 빠르지만 코믹하거나 민속 축제처럼 들리지 않는다.",
            "key": "F major, bright acoustic color",
            "bpm": 104,
            "instrumentation": ["피치카토 첼로", "바순", "스피넷", "작은 프레임 드럼", "목재 셰이커"],
        },
        "bgm-04-relic": {
            "name": "황금 망치의 마지막 호가",
            "character": "일반 경매의 콘트라베이스 모티프가 큰 홀과 낮은 박동으로 확장되는 최종 보스 경매.",
            "key": "auction motif, lowered register",
            "bpm": 86,
            "instrumentation": ["콘트라베이스", "브러시", "뮤트 피아노", "낮은 프레임 드럼", "넓은 홀 반사"],
        },
        "bgm-06-archive": {
            "name": "상회의 푸른 창문",
            "character": "타이틀 주제를 다른 구간과 작업 리듬으로 되받는 플레이어 상회의 본거점 음악.",
            "key": "F major reprise",
            "bpm": 88,
            "instrumentation": ["피치카토 현악", "클라리넷", "스피넷", "작은 목재 퍼커션"],
        },
        "bgm-13-guild-vault": {
            "name": "도장 아래의 금빛 계약",
            "character": "계약과 담보를 다루는 중개인 조합의 정중한 권위. 위협보다 격식과 책임의 무게를 강조한다.",
        },
        "bgm-14-merchant-workshop": {
            "name": "저울과 기어의 오후",
            "character": "거래소의 빠르고 명료한 작업 리듬. 주판·저울·장부가 돌아가는 활기를 건조하게 받친다.",
        },
    }
    for track in data["bgm"]:
        track.update(track_updates.get(track["id"], {}))

    data["sceneBgmMap"]["scene-continue"] = {"bgm": "bgm-01-title"}
    data["sceneBgmMap"]["scene-merchant"] = {"bgm": "bgm-06-archive"}
    data["sceneBgmMap"]["scene-exchange"] = {
        "bgm": "bgm-14-merchant-workshop",
        "variants": [{"bgm": "bgm-12-exchange-ledger", "when": {"mode": "market-detail"}}],
    }
    data["sceneBgmMap"]["scene-guild"] = {"bgm": "bgm-13-guild-vault"}
    data["sceneBgmMap"]["scene-final"] = {"bgm": "bgm-04-relic", "layers": ["L1"]}

    data["version"] = "6.4-sound-3.6-bright-city-relic-boss-foley"
    data["musicProgram"]["principle"] = (
        "밝은 항구 도시의 장기 운영 리듬을 중심에 두고, 타이틀 모티프는 상회에서만 변주한다. "
        "일반 경매는 저밀도 누아르 재즈, 유물 경매는 같은 모티프의 보스 버전, 조합은 귀족적 계약 실내악, "
        "거래소는 건조한 작업 리듬으로 역할을 분리한다."
    )
    data["selectedBgmProgram"] = {
        "version": "3.6",
        "loopSeconds": LOOP_SECONDS,
        "crossfadeSeconds": LOOP_CROSSFADE_SECONDS,
        "targetRmsDbfs": TARGET_RMS_DBFS,
        "peakCeilingDbfs": PEAK_CEILING_DBFS,
        "tracks": [
            {"programId": key, **{k: v for k, v in entry.items() if k != "ids"}, "logicalBgmIds": entry["ids"]}
            for key, entry in PROGRAM.items()
        ],
    }
    generation = data.setdefault("generation", {})
    generation["engine"] = "selected-source loop renderer v3.6 bright city / merchant reprise / relic boss"
    generation["musicSourceCount"] = len({entry["file"] for entry in PROGRAM.values()})
    generation["adaptiveLayerPolicy"] = "L1 complete mix; L2/L3 silent compatibility slots"
    files = data.setdefault("files", {})
    files.setdefault("layout", {})["bgm"] = "assets/runtime/audio/bgm/<bgm-id>[__<layer>].wav"
    files.setdefault("formats", {})["bgm"] = {
        "container": "wav",
        "bitDepth": 16,
        "sampleRate": SAMPLE_RATE,
        "channels": CHANNELS,
        "note": "Selected-source 36-second loop edits; L2/L3 may be silent compatibility slots.",
    }
    return data


def main() -> None:
    MASTER_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_BGM_DIR.mkdir(parents=True, exist_ok=True)
    masters: dict[str, tuple[np.ndarray, np.ndarray]] = {}

    for program_id, entry in PROGRAM.items():
        source = SOURCE_DIR / entry["file"]
        if not source.exists():
            raise FileNotFoundError(source)
        decoded = normalize(trim_silence(decode_source(source)))
        offset = {
            "02_city": CITY_SOURCE_OFFSET_SECONDS,
            "06_relic_boss": RELIC_BOSS_SOURCE_OFFSET_SECONDS,
            "08_merchant_reprise": MERCHANT_SOURCE_OFFSET_SECONDS,
            "09_exchange": EXCHANGE_SOURCE_OFFSET_SECONDS,
            "10_guild_chamber": GUILD_SOURCE_OFFSET_SECONDS,
        }.get(program_id)
        loop = normalize(select_loop_region(decoded, offset))
        if program_id == "02_city":
            loop = city_bright_refit(loop)
        elif program_id == "06_relic_boss":
            loop = relic_boss_refit(loop)
        elif program_id == "08_merchant_reprise":
            loop = merchant_reprise_refit(loop)
        elif program_id == "09_exchange":
            loop = exchange_refit(loop)
        intro = normalize(make_intro(decoded))
        masters[program_id] = (loop, intro)
        write_wav(MASTER_DIR / f"{program_id}.wav", loop)

    data = json.loads(SOUND_JSON.read_text(encoding="utf-8"))
    assignment = {
        bgm_id: program_id
        for program_id, entry in PROGRAM.items()
        for bgm_id in entry["ids"]
    }
    tracks = {track["id"]: track for track in data["bgm"]}

    for bgm_id, track in tracks.items():
        program_id = assignment[bgm_id]
        loop, intro = masters[program_id]
        for filename, auxiliary in slot_paths_for(track):
            if filename.endswith("__intro.wav"):
                rendered = intro
            elif auxiliary:
                rendered = np.zeros_like(loop)
            else:
                rendered = loop
            write_wav(RUNTIME_BGM_DIR / filename, rendered)

    data = apply_contract_metadata(data)
    SOUND_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    RUNTIME_JS.write_text(
        "window.UNKNOWN_AUCTION_SOUND = "
        + json.dumps(data, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )

    # One command updates audio, runtime data, flow.json, and the embedded VSL
    # contract. This prevents the editor and index.html from drifting apart.
    runpy.run_path(str(ROOT / "tools" / "sync_vsl_sound_editor.py"), run_name="__main__")

    summary = {
        "programVersion": data["version"],
        "sources": len(PROGRAM),
        "runtimeBgmFiles": len(list(RUNTIME_BGM_DIR.glob("*.wav"))),
        "runtimeBgmBytes": sum(p.stat().st_size for p in RUNTIME_BGM_DIR.glob("*.wav")),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

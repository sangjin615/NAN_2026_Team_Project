#!/usr/bin/env python3
"""Separate the four core auction feedback gestures for Audio v3.6.1."""

from __future__ import annotations

import importlib.util
import json
import runpy
import sys
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "assets" / "runtime" / "audio" / "sfx"
SOUND_JSON = ROOT / "sound" / "sound.json"
GENERATOR = ROOT / "tools" / "generate_prototype_audio.py"


def load_renderer():
    vendor = (
        ROOT.parent
        / "_보관_사운드작업_2026-08-03"
        / "01_이전버전_폴더"
        / "미지의경매장_V6.4_아트디렉션_사운드프로그램_v3.0"
        / "tools"
        / "_vendor"
    )
    if vendor.exists() and str(vendor) not in sys.path:
        # NumPy is imported above from the bundled runtime; append only so the
        # compatible CPython 3.12 miniaudio decoder can be resolved here.
        sys.path.append(str(vendor))
    spec = importlib.util.spec_from_file_location("auction_audio_renderer", GENERATOR)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load renderer: {GENERATOR}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    source_candidates = [
        ROOT / "sound" / "source-sfx" / "cc0",
        ROOT.parent
        / "_보관_사운드작업_2026-08-03"
        / "03_작업소스"
        / "미지의경매장_V6.4_v3.6_재생성소스"
        / "sound"
        / "source-sfx"
        / "cc0",
    ]
    module.CC0 = next((path for path in source_candidates if path.exists()), None)
    if module.CC0 is None:
        raise FileNotFoundError("CC0 Foley source folder not found")
    return module


def render_bid(renderer) -> np.ndarray:
    """Upward two-stage paddle/ratchet: decisive, compact, not celebratory."""
    seconds = 0.48
    out = np.zeros(renderer.samples(seconds))
    paddle = renderer.foley_excerpt("wood-metal-100/wood_misc_03.ogg", 0.16, "core-bid-paddle")
    mechanism = renderer.foley_excerpt("mechanical1.wav", 0.20, "core-bid-mechanism")
    renderer.place(out, paddle, 0.00, 0.48)
    renderer.place(out, renderer.felt_click(0.12, "core-bid-lift", 0.95), 0.035, 0.34)
    renderer.place(out, mechanism, 0.115, 0.36)
    renderer.place(out, renderer.muted_brass(0.13, 515, "core-bid-step-1"), 0.105, 0.15)
    renderer.place(out, renderer.muted_brass(0.16, 625, "core-bid-step-2"), 0.225, 0.20)
    return renderer.warm_finish(out)


def render_pass(renderer) -> np.ndarray:
    """A downward, soft withdrawal gesture with the impact delayed to the end."""
    seconds = 0.70
    out = np.zeros(renderer.samples(seconds))
    fabric = renderer.foley_excerpt(
        "rpg-pack/RPG Sound Pack/inventory/cloth-heavy.wav", 0.58, "core-pass-fabric"
    )
    renderer.place(out, fabric, 0.00, 0.58)
    renderer.place(out, renderer.soft_sweep(0.52, "core-pass-down", upward=False), 0.015, 0.75)
    renderer.place(out, renderer.wood_hit(0.19, 108, 0.02, "core-pass-set-down"), 0.46, 0.48)
    renderer.place(out, renderer.cloth(0.20, "core-pass-felt"), 0.49, 0.16)
    return renderer.warm_finish(out)


def render_gavel(renderer) -> np.ndarray:
    """Three unmistakable gavel strikes; only the final strike carries a short room tail."""
    seconds = 1.45
    out = np.zeros(renderer.samples(seconds))
    foley = renderer.foley_excerpt("wood-metal-100/wood_hammer_02.ogg", 0.30, "core-gavel")
    for index, (at, gain, pitch) in enumerate(((0.00, 0.63, 98), (0.36, 0.70, 94), (0.80, 0.86, 84))):
        renderer.place(out, foley, at, gain)
        renderer.place(out, renderer.wood_hit(0.32, pitch, 0.01, f"core-gavel-body-{index}"), at, 0.50)
    # Short wooden-room tail on the verdict strike, without a metallic chime.
    renderer.place(out, foley, 0.865, 0.16)
    renderer.place(out, renderer.wood_hit(0.46, 76, 0.00, "core-gavel-tail"), 0.90, 0.18)
    return renderer.warm_finish(out)


def render_lot_win(renderer) -> np.ndarray:
    """Ownership confirmation after the gavel: brass tag and ledger, no wood hit."""
    seconds = 0.72
    out = np.zeros(renderer.samples(seconds))
    tag = renderer.foley_excerpt(
        "rpg-pack/RPG Sound Pack/inventory/metal-small2.wav", 0.23, "core-win-tag"
    )
    latch = renderer.foley_excerpt("mechanical1.wav", 0.17, "core-win-latch")
    renderer.place(out, tag, 0.02, 0.48)
    renderer.place(out, renderer.muted_brass(0.20, 560, "core-win-brass"), 0.07, 0.18)
    renderer.place(out, latch, 0.21, 0.34)
    renderer.place(out, renderer.ledger_mark(0.34, "core-win-ledger"), 0.35, 0.46)
    return renderer.warm_finish(out)


def main() -> None:
    renderer = load_renderer()
    sound = json.loads(SOUND_JSON.read_text(encoding="utf-8"))
    revisions = {
        "sfx-bid-place": {
            "durationSec": 0.48,
            "gain": -9,
            "desc": "목재 입찰패가 올라가고 황동 호가 래칫이 두 단계 상승",
            "prompt": "Player bid: a wooden auction paddle lifts, followed by two rising brass ratchet steps; compact, dry and decisive.",
            "prototypeSourceFamily": "wood+mechanical+muted-brass",
            "render": render_bid,
        },
        "sfx-pass": {
            "durationSec": 0.70,
            "gain": -12,
            "desc": "천 덮인 입찰패가 아래로 미끄러져 받침에 조용히 눕는 소리",
            "prompt": "Pass: a felt-covered paddle slides downward, then rests softly on a wooden stand; no click, no success tone.",
            "prototypeSourceFamily": "cloth+low-wood",
            "render": render_pass,
        },
        "sfx-gavel": {
            "durationSec": 1.45,
            "gain": -6,
            "desc": "간격이 분명한 목재 망치 3타. 마지막 타만 짧은 실내 잔향",
            "prompt": "Auction sold: three clearly spaced wooden gavel strikes, with a short dry room tail only on the final strike.",
            "prototypeSourceFamily": "gavel+wood-room",
            "render": render_gavel,
        },
        "sfx-lot-win": {
            "durationSec": 0.72,
            "gain": -8,
            "desc": "망치 이후 황동 소유 태그가 잠기고 장부에 짧게 기입",
            "prompt": "Player lot won: a small brass ownership tag clips shut, a mechanism locks, then a brief ledger mark; no gavel or fanfare.",
            "prototypeSourceFamily": "metal+mechanical+paper",
            "render": render_lot_win,
        },
    }

    cues = {cue["id"]: cue for cue in sound["sfx"]}
    for cue_id, revision in revisions.items():
        cue = cues[cue_id]
        for key in ("durationSec", "gain", "desc", "prompt", "prototypeSourceFamily"):
            cue[key] = revision[key]
        renderer.write_wav(AUDIO / f"{cue_id}.wav", revision["render"](renderer), peak=0.60 if cue_id == "sfx-gavel" else 0.54)

    program = sound.setdefault("sfxRefitProgram", {})
    program["coreAuctionRevision"] = "3.6.1"
    program["coreAuctionDirection"] = (
        "패스=하강 마찰, 입찰=상승 황동 래칫, 낙찰=목재 망치 3타, 획득=황동 태그+장부로 기능 실루엣 분리"
    )
    program["coreAuctionCues"] = list(revisions)
    SOUND_JSON.write_text(json.dumps(sound, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    runpy.run_path(str(ROOT / "tools" / "sync_vsl_sound_editor.py"), run_name="__main__")
    print("AUCTION_CORE_SFX_REVISION=3.6.1")
    for cue_id in revisions:
        print(AUDIO / f"{cue_id}.wav")


if __name__ == "__main__":
    main()

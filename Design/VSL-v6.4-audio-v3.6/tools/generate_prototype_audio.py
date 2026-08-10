#!/usr/bin/env python3
"""Render the approved-BGM-matched Audio v3.4 interactive SFX set.

This renderer deliberately uses recognizable acoustic-material gestures rather
than one generic synth patch.  The WAVs remain replaceable prototypes; cue IDs,
layering and runtime paths are the production contract.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import runpy
import sys
import wave
from pathlib import Path

import numpy as np
import miniaudio


ROOT = Path(__file__).resolve().parents[1]
AUDIO = ROOT / "assets" / "runtime" / "audio"
CC0 = ROOT / "sound" / "source-sfx" / "cc0"
RATE = 44100

FOLEY_BANKS = {
    "ui": [
        "squeakyclick1.wav", "wood-metal-100/wood_misc_01.ogg", "wood-metal-100/wood_misc_02.ogg",
        "rpg-pack/RPG Sound Pack/interface/interface1.wav", "rpg-pack/RPG Sound Pack/interface/interface2.wav",
        "rpg-pack/RPG Sound Pack/interface/interface3.wav", "rpg-pack/RPG Sound Pack/interface/interface4.wav",
    ],
    "paper": [
        *[f"book-flips/BookFlip{i}.wav" for i in range(1, 14)], "various/turn_page.wav",
    ],
    "wood": [
        *[f"wood-metal-100/wood_hit_{i:02d}.ogg" for i in range(1, 10)],
        *[f"wood-metal-100/wood_misc_{i:02d}.ogg" for i in range(1, 10)],
    ],
    "gavel": [
        "wood-metal-100/wood_hammer_01.ogg", "wood-metal-100/wood_hammer_02.ogg",
        "wood-metal-100/hammer_01.ogg", "wood-metal-100/hammer_02.ogg",
        "wood-metal-100/hammer_03.ogg", "wood-metal-100/hammer_04.ogg",
    ],
    "mechanical": [
        "mechanical1.wav", "clank1.wav", "wood-metal-100/metal_spring_01.ogg",
        "wood-metal-100/metal_spring_02.ogg", "wood-metal-100/lock_open_01.ogg",
        *[f"wood-metal-100/tools_{i:02d}.ogg" for i in range(1, 13)],
    ],
    "metal": [
        *[f"wood-metal-100/metal_hit_{i:02d}.ogg" for i in range(1, 6)],
        "rpg-pack/RPG Sound Pack/inventory/metal-small1.wav",
        "rpg-pack/RPG Sound Pack/inventory/metal-small2.wav",
        "rpg-pack/RPG Sound Pack/inventory/metal-small3.wav",
    ],
    "coin": [
        "rpg-pack/RPG Sound Pack/inventory/coin.wav", "rpg-pack/RPG Sound Pack/inventory/coin2.wav",
        "rpg-pack/RPG Sound Pack/inventory/coin3.wav", "rpg-pack/RPG Sound Pack/inventory/beads.wav",
        "various/pickup_coins.wav",
    ],
    "door": [
        "rpg-pack/RPG Sound Pack/world/door.wav", "various/door_open.wav", "various/door_close.wav",
        "various/door_creak_open.wav", "various/door_creak_close.wav",
        "wood-metal-100/wood_close_01.ogg", "wood-metal-100/wood_close_02.ogg",
    ],
    "lock": [
        "various/lock.wav", "various/lock_pick.wav", "various/cant_open.wav",
        "wood-metal-100/lock_open_01.ogg", "wood-metal-100/keys_01.ogg", "wood-metal-100/keys_03.ogg",
    ],
    "cloth": [
        "rpg-pack/RPG Sound Pack/inventory/cloth.wav",
        "rpg-pack/RPG Sound Pack/inventory/cloth-heavy.wav",
    ],
}

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def rng_for(name: str) -> np.random.Generator:
    seed = int.from_bytes(hashlib.blake2s(name.encode("utf-8"), digest_size=8).digest(), "little")
    return np.random.default_rng(seed)


def samples(seconds: float) -> int:
    return max(1, int(RATE * max(0.001, seconds)))


def envelope(seconds: float, attack: float = 0.004, release: float = 0.12, sustain: float = 1.0) -> np.ndarray:
    n = samples(seconds)
    out = np.full(n, sustain, dtype=np.float64)
    a = min(n, max(1, samples(attack)))
    r = min(n, max(1, samples(release)))
    out[:a] *= np.linspace(0.0, 1.0, a, endpoint=False)
    out[-r:] *= np.linspace(1.0, 0.0, r)
    return out


def moving_average(x: np.ndarray, width: int) -> np.ndarray:
    width = max(1, min(int(width), len(x)))
    if width == 1:
        return x.copy()
    c = np.cumsum(np.insert(x, 0, 0.0))
    core = (c[width:] - c[:-width]) / width
    left = np.full(width // 2, core[0] if len(core) else 0.0)
    right = np.full(len(x) - len(core) - len(left), core[-1] if len(core) else 0.0)
    return np.concatenate([left, core, right])[: len(x)]


def place(out: np.ndarray, sound: np.ndarray, at: float, gain: float = 1.0) -> None:
    start = max(0, int(at * RATE))
    if start >= len(out):
        return
    end = min(len(out), start + len(sound))
    out[start:end] += sound[: end - start] * gain


def sequence(parts: list[tuple[float, np.ndarray, float]], seconds: float) -> np.ndarray:
    out = np.zeros(samples(seconds))
    for at, sound, gain in parts:
        place(out, sound, at, gain)
    return out


_FOLEY_CACHE: dict[str, np.ndarray] = {}


def decode_foley(relative_path: str) -> np.ndarray:
    cached = _FOLEY_CACHE.get(relative_path)
    if cached is not None:
        return cached
    path = CC0 / relative_path
    if not path.exists():
        raise FileNotFoundError(path)
    decoded = miniaudio.decode(
        path.read_bytes(), output_format=miniaudio.SampleFormat.FLOAT32,
        nchannels=1, sample_rate=RATE,
    )
    audio = np.asarray(decoded.samples, dtype=np.float64).copy()
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 1e-8:
        active = np.flatnonzero(np.abs(audio) >= peak * 0.012)
        if active.size:
            margin = samples(.035)
            audio = audio[max(0, int(active[0]) - margin):min(len(audio), int(active[-1]) + margin)]
        audio /= max(float(np.max(np.abs(audio))), 1e-8)
    _FOLEY_CACHE[relative_path] = audio
    return audio


def foley_excerpt(relative_path: str, seconds: float, identity: str) -> np.ndarray:
    source = decode_foley(relative_path)
    target = samples(seconds)
    if len(source) > target:
        # 가장 선명한 몸통을 선택하되 첫 어택 앞의 짧은 여백은 보존한다.
        window = max(1, min(target, samples(.12)))
        energy = np.convolve(np.square(source), np.ones(window) / window, mode="valid")
        centre = int(np.argmax(energy)) if energy.size else 0
        start = max(0, min(len(source) - target, centre - samples(.018)))
        source = source[start:start + target]
    elif len(source) < target:
        source = np.pad(source, (0, target - len(source)))
    else:
        source = source.copy()
    source = moving_average(source, 2)
    fade_in = min(len(source), samples(.002))
    fade_out = min(len(source), samples(min(.045, seconds * .28)))
    if fade_in:
        source[:fade_in] *= np.linspace(0, 1, fade_in, endpoint=False)
    if fade_out:
        source[-fade_out:] *= np.linspace(1, 0, fade_out)
    return source


def foley_bank_for(cue: dict) -> str:
    cue_id = cue["id"]
    group = cue.get("group", "ui")
    if "gavel" in cue_id or "hammer" in cue_id:
        return "gavel"
    if "coin" in cue_id or cue_id in {"sfx-info-buy", "sfx-sell", "sfx-sale-confirm"}:
        return "coin"
    if any(word in cue_id for word in ("page", "paper", "quest", "ledger", "summary", "info", "save", "catalog", "result")):
        return "paper"
    if any(word in cue_id for word in ("lock", "loan", "collateral", "capacity", "disabled")):
        return "lock"
    if any(word in cue_id for word in ("scene-in", "venue-enter", "door")):
        return "door"
    if any(word in cue_id for word in ("appraise", "relic", "seal", "metal")):
        return "metal"
    if any(word in cue_id for word in ("pass", "curtain", "inventory-pick")):
        return "cloth"
    if group in {"guild", "merchant"} or any(word in cue_id for word in ("toggle", "settings", "number", "increment", "day-advance", "market", "upgrade", "loading")):
        return "mechanical"
    if group == "auction":
        return "wood"
    if group in {"entry", "city", "exchange", "summary", "result", "meta"}:
        return "wood"
    return "ui"


def cc0_foley_layer(cue: dict, base: np.ndarray) -> np.ndarray:
    cue_id = cue["id"]
    seconds = max(.06, float(cue.get("durationSec", .5)))
    if cue.get("loop"):
        if cue_id in {"amb-loading-gears", "amb-deadline-tick"}:
            tick = decode_foley("ticking_clock.wav")
            repeats = math.ceil(len(base) / max(1, len(tick)))
            tick = np.tile(tick, repeats)[:len(base)]
            tick = tick / max(float(np.max(np.abs(tick))), 1e-8)
            return base * .58 + tick * (.105 if cue_id == "amb-loading-gears" else .16)
        return base

    bank_name = foley_bank_for(cue)
    bank = FOLEY_BANKS[bank_name]
    index = int.from_bytes(hashlib.blake2s(cue_id.encode("utf-8"), digest_size=4).digest(), "little") % len(bank)
    source_path = bank[index]
    out = base * (.34 if cue.get("accent") else .28)

    if bank_name == "gavel":
        gap = .55 if cue.get("group") == "relic" else .38
        hit_seconds = min(.48, max(.16, seconds - gap * 2))
        hit = foley_excerpt(source_path, hit_seconds, cue_id)
        for i in range(3):
            place(out, hit, i * gap, .78 - i * .08)
    else:
        main = foley_excerpt(source_path, min(seconds, max(.08, seconds * .86)), cue_id)
        place(out, main, 0, .76)
        # 기능군의 고유 재질을 한 겹 더 얹어 같은 샘플 팩 안에서도 역할을 구분한다.
        if bank_name in {"paper", "cloth"} and seconds > .18:
            wood_bank = FOLEY_BANKS["wood"]
            wood_path = wood_bank[(index + 3) % len(wood_bank)]
            place(out, foley_excerpt(wood_path, min(.16, seconds), cue_id + "-wood"), seconds * .55, .24)
        elif bank_name in {"mechanical", "lock", "metal"} and seconds > .16:
            ui_bank = FOLEY_BANKS["ui"]
            ui_path = ui_bank[(index + 2) % len(ui_bank)]
            place(out, foley_excerpt(ui_path, min(.12, seconds), cue_id + "-contact"), min(seconds * .42, .18), .22)
    return out


def pitched(freq: float, seconds: float, harmonics: tuple[tuple[float, float], ...], decay: float = 4.0,
            vibrato: float = 0.0, rng: np.random.Generator | None = None) -> np.ndarray:
    n = samples(seconds)
    t = np.arange(n) / RATE
    phase = 2 * np.pi * freq * t
    if vibrato:
        phase += vibrato * np.sin(2 * np.pi * 5.1 * t)
    out = np.zeros(n)
    local = rng or rng_for(str(freq))
    for ratio, amp in harmonics:
        out += amp * np.sin(phase * ratio + local.uniform(-0.08, 0.08))
    return out * np.exp(-decay * t) * envelope(seconds, 0.003, min(0.16, seconds * 0.35))


def wood_hit(seconds: float, pitch: float = 180.0, bright: float = 0.25, seed: str = "wood") -> np.ndarray:
    rng = rng_for(seed)
    n = samples(seconds)
    t = np.arange(n) / RATE
    noise = moving_average(rng.normal(0, 1, n), 22)
    body = pitched(pitch, seconds, ((1, 1), (1.91, 0.28), (2.77, 0.12)), 11.5, rng=rng)
    transient = noise * np.exp(-45 * t) * envelope(seconds, 0.001, 0.035)
    return body * (0.75 + bright * 0.3) + transient * (0.5 + bright)


def brass_tick(seconds: float, base: float = 720.0, seed: str = "brass") -> np.ndarray:
    rng = rng_for(seed)
    return pitched(base, seconds, ((1, 1), (1.48, .42), (2.16, .25), (3.31, .11)), 8.5, rng=rng) * .68


def muted_brass(seconds: float, base: float = 520.0, seed: str = "muted-brass") -> np.ndarray:
    """Felt-damped brass contact: tactile, short and deliberately non-musical."""
    rng = rng_for(seed)
    tone = pitched(base, seconds, ((1, 1), (1.51, .18), (2.23, .07)), 18.0, rng=rng)
    dust = moving_average(rng.normal(0, 1, samples(seconds)), 28)
    dust *= envelope(seconds, .001, min(.035, seconds * .45)) * .18
    return tone * .38 + dust


def felt_click(seconds: float, seed: str = "felt", weight: float = 1.0) -> np.ndarray:
    """Dry internal mechanism with no bright digital transient."""
    rng = rng_for(seed)
    n = samples(seconds)
    t = np.arange(n) / RATE
    thud = pitched(165, seconds, ((1, 1), (1.76, .16)), 24.0, rng=rng) * .34
    fibre = moving_average(rng.normal(0, 1, n), 62) * np.exp(-38 * t)
    fibre *= envelope(seconds, .001, min(.045, seconds * .5)) * .55
    return (thud + fibre) * weight


def ledger_mark(seconds: float, seed: str = "ledger") -> np.ndarray:
    """Pencil/nib mark for accounting feedback without a success chime."""
    rng = rng_for(seed)
    n = samples(seconds)
    noise = rng.normal(0, 1, n)
    rasp = noise - moving_average(noise, 54)
    rasp = moving_average(rasp, 12)
    t = np.arange(n) / RATE
    motion = .3 + .7 * np.abs(np.sin(2 * np.pi * 11.0 * t))
    return rasp * motion * envelope(seconds, .006, min(.06, seconds * .4)) * .18


def warm_finish(signal: np.ndarray, ambience_bus: bool = False) -> np.ndarray:
    """Round off procedural highs and add very light tape-like density."""
    if not signal.size:
        return signal
    width = 5 if ambience_bus else 3
    rounded = moving_average(signal, width)
    drive = 1.08 if ambience_bus else 1.18
    return np.tanh(rounded * drive) / np.tanh(drive)


def glass_ping(seconds: float, base: float = 1040.0, seed: str = "glass") -> np.ndarray:
    rng = rng_for(seed)
    return pitched(base, seconds, ((1, 1), (2.71, .32), (4.08, .15)), 3.5, rng=rng) * .55


def coin_hit(seconds: float, base: float = 1300.0, seed: str = "coin") -> np.ndarray:
    return brass_tick(seconds, base, seed) + glass_ping(seconds, base * 1.18, seed + "g") * .28


def paper_noise(seconds: float, seed: str = "paper", weight: float = 1.0) -> np.ndarray:
    rng = rng_for(seed)
    n = samples(seconds)
    noise = rng.normal(0, 1, n)
    high = noise - moving_average(noise, 90)
    # Aged paper has a soft fibre rasp, not full-band digital hiss.
    high = moving_average(high, 7)
    t = np.arange(n) / RATE
    flutter = .25 + .75 * np.abs(np.sin(2 * np.pi * (5.3 + rng.uniform(-1, 1)) * t))
    return high * flutter * envelope(seconds, .015, min(.18, seconds * .35)) * .18 * weight


def cloth(seconds: float, seed: str = "cloth") -> np.ndarray:
    rng = rng_for(seed)
    n = samples(seconds)
    low = moving_average(rng.normal(0, 1, n), 75)
    return low * envelope(seconds, .025, min(.2, seconds * .4)) * 1.7


def soft_sweep(seconds: float, seed: str = "sweep", upward: bool = True) -> np.ndarray:
    rng = rng_for(seed)
    n = samples(seconds)
    noise = rng.normal(0, 1, n)
    t = np.arange(n) / RATE
    shape = t / max(seconds, .001)
    if not upward:
        shape = 1 - shape
    filtered = noise - moving_average(noise, (70 - 45 * shape).astype(int).mean())
    return filtered * envelope(seconds, .03, .18) * (.04 + .14 * shape)


def bell(seconds: float, base: float = 420.0, seed: str = "bell") -> np.ndarray:
    rng = rng_for(seed)
    return pitched(base, seconds, ((1, 1), (2.01, .42), (2.72, .28), (4.08, .12)), 2.2, rng=rng) * .55


def ratchet(seconds: float, steps: int, base: float, seed: str) -> np.ndarray:
    out = np.zeros(samples(seconds))
    gap = max(.045, min(.11, seconds / max(1, steps + 1)))
    for i in range(steps):
        place(out, felt_click(min(.11, seconds), f"{seed}{i}", .9), i * gap, .62)
        place(out, muted_brass(min(.08, seconds), base + 10 * i, f"{seed}b{i}"), i * gap, .07)
    return out


def ambience(cue_id: str, seconds: float) -> np.ndarray:
    rng = rng_for(cue_id)
    n = samples(seconds)
    t = np.arange(n) / RATE
    # The approved BGM already supplies motion. Ambience only locates the room.
    air = moving_average(rng.normal(0, 1, n), 420) * .075
    out = air * (.75 + .25 * np.sin(2 * np.pi * .06 * t))

    if cue_id == "amb-city-harbor":
        out += moving_average(rng.normal(0, 1, n), 1100) * .11
        for i, at in enumerate(np.arange(2.1, seconds, 6.4)):
            place(out, wood_hit(.28, 92, .04, f"rope{i}"), at, .032)
        out += np.sin(2 * np.pi * .07 * t) * .006
    elif cue_id == "amb-loading-gears":
        for i, at in enumerate(np.arange(.18, seconds, .64)):
            place(out, felt_click(.08, f"gear{i}", .7), at, .075)
        for i, at in enumerate(np.arange(1.6, seconds, 3.2)):
            place(out, muted_brass(.1, 430, f"cam{i}"), at, .025)
    elif cue_id == "amb-deadline-tick":
        out *= .22
        for i, at in enumerate(np.arange(.15, seconds, 1.0)):
            place(out, felt_click(.09, f"clock{i}", .8), at, .11)
    elif cue_id == "amb-auction-crowd":
        murmur = moving_average(rng.normal(0, 1, n), 680) * (.075 + .018 * np.sin(2 * np.pi * .13 * t))
        out += murmur
        for i, at in enumerate(np.arange(3.1, seconds, 5.8)):
            place(out, cloth(.38, f"chair{i}"), at, .035)
    elif cue_id == "amb-office-paper":
        out *= .42
        for i, at in enumerate(np.arange(2.2, seconds, 6.1)):
            place(out, paper_noise(.45, f"office{i}"), at, .07)
    elif cue_id == "amb-tavern-hearth":
        impulses = rng.normal(0, 1, n) * (rng.random(n) > .9975)
        out += moving_average(impulses, 12) * .48
        out += moving_average(rng.normal(0, 1, n), 210) * .035
    elif cue_id == "amb-exchange-floor":
        for i, at in enumerate(np.arange(1.4, seconds, 4.8)):
            place(out, ledger_mark(.28, f"ledger{i}"), at, .055)
            place(out, felt_click(.08, f"abacus{i}", .7), at + .75, .05)
    elif cue_id == "amb-guild-vault":
        out += np.sin(2 * np.pi * 73 * t) * .004
        for i, at in enumerate(np.arange(4, seconds, 8.2)):
            place(out, wood_hit(.25, 78, .04, f"vault{i}"), at, .022)
    elif cue_id == "amb-merchant-workshop":
        for i, at in enumerate(np.arange(1.2, seconds, 3.4)):
            place(out, felt_click(.08, f"shop{i}", .7), at, .055)
    elif cue_id == "amb-relic-hall":
        out *= .38
        out += np.sin(2 * np.pi * 61 * t) * .0035
        for i, at in enumerate(np.arange(5, seconds, 9.0)):
            place(out, cloth(.55, f"curtain{i}"), at, .022)
    elif cue_id == "amb-museum-room":
        out *= .3
        for i, at in enumerate(np.arange(4.2, seconds, 9.5)):
            place(out, cloth(.42, f"museum{i}"), at, .018)

    edge = min(samples(.7), len(out) // 3)
    out[:edge] *= np.linspace(.6, 1, edge)
    out[-edge:] *= np.linspace(1, .6, edge)
    return warm_finish(out, ambience_bus=True)


def synth_cue(cue: dict) -> np.ndarray:
    cue_id = cue["id"]
    seconds = max(.06, float(cue.get("durationSec", .5)))
    group = cue.get("group", "ui")
    out = np.zeros(samples(seconds))
    if cue.get("loop"):
        return ambience(cue_id, seconds)

    # Global UI: felted wood latch + muted brass contact. No modern bright ping.
    if cue_id == "sfx-ui-hover":
        place(out, felt_click(seconds, cue_id, .55), 0, .22)
    elif cue_id in {"sfx-ui-click", "sfx-slot-select", "sfx-ui-focus"}:
        place(out, wood_hit(seconds, 245, .12, cue_id), 0, .56)
        place(out, muted_brass(seconds, 470, cue_id), .012, .08)
    elif cue_id in {"sfx-ui-back", "sfx-popup-close", "sfx-modal-cancel"}:
        place(out, wood_hit(min(.22, seconds), 235, .12, cue_id), 0, .58)
        place(out, cloth(seconds, cue_id), .02, .12)
    elif cue_id in {"sfx-ui-disabled", "sfx-city-location-lock", "sfx-capacity-full"}:
        place(out, wood_hit(seconds, 145, .05, cue_id), 0, .62)
        if seconds > .18:
            place(out, felt_click(.11, cue_id + "l", .7), .11, .12)
    elif cue_id in {"sfx-ui-tab", "sfx-page-turn", "sfx-tooltip-open"}:
        place(out, paper_noise(seconds, cue_id), 0, .55)
        place(out, wood_hit(min(.12, seconds), 280, .12, cue_id + "w"), max(0, seconds * .55), .28)
    elif cue_id in {"sfx-popup-open", "sfx-scene-in", "sfx-city-map-open"}:
        place(out, paper_noise(seconds, cue_id), 0, .45)
        place(out, wood_hit(.18, 190, .1, cue_id + "w"), seconds * .55, .4)
    elif cue_id in {"sfx-modal-confirm", "sfx-save", "sfx-quest-accept", "sfx-quest-success", "sfx-summary-quest-success"}:
        place(out, wood_hit(.2, 125, .06, cue_id), 0, .62)
        place(out, muted_brass(min(.22, seconds), 410, cue_id + "b"), .07, .12)
    elif cue_id in {"sfx-ui-toggle-on", "sfx-ui-toggle-off", "sfx-settings-tick", "sfx-ui-number-step", "sfx-bid-increment", "sfx-auction-countdown"}:
        weight = .72 if cue_id.endswith("off") else .9
        place(out, felt_click(seconds, cue_id, weight), 0, .58)
        place(out, muted_brass(seconds, 360 if cue_id.endswith("off") else 450, cue_id + "b"), 0, .06)
    elif cue_id in {"sfx-toast", "sfx-load-complete", "sfx-loading-done"}:
        place(out, wood_hit(.16, 225, .08, cue_id + "w"), 0, .46)
        place(out, muted_brass(min(seconds, .2), 430, cue_id), .07, .11)
        if seconds > .45:
            place(out, ledger_mark(.22, cue_id + "mark"), .22, .15)
    elif cue_id in {"sfx-failure", "sfx-quest-fail", "sfx-summary-quest-fail"}:
        place(out, wood_hit(.24, 132, .05, cue_id), 0, .7)
        place(out, paper_noise(seconds, cue_id + "p"), .05, .25)
    elif "coin" in cue_id or cue_id in {"sfx-info-buy", "sfx-sell", "sfx-sale-confirm"}:
        count = 2 if any(x in cue_id for x in ("gain", "sell", "sale")) else 1
        for i in range(count):
            place(out, muted_brass(min(.3, seconds), 560 + 35 * i, f"{cue_id}{i}"), i * .11, .28)
        if "sale" in cue_id or cue_id == "sfx-sell":
            place(out, wood_hit(.16, 250, .15, cue_id + "abacus"), .03, .35)
    elif cue_id == "sfx-title-logo":
        place(out, cloth(.5, cue_id + "cover"), 0, .24)
        place(out, wood_hit(.24, 118, .05, cue_id + "book"), .12, .56)
        place(out, muted_brass(.24, 390, cue_id + "crest"), .46, .13)
        place(out, ledger_mark(.34, cue_id + "line"), .7, .15)
    elif cue_id in {"sfx-new-run", "sfx-next-journey"}:
        place(out, wood_hit(.18, 175, .08, cue_id), 0, .48)
        place(out, paper_noise(.42, cue_id + "paper"), .1, .32)
        place(out, felt_click(.14, cue_id + "latch", .85), .42, .28)
    elif cue_id == "sfx-slot-delete":
        place(out, paper_noise(seconds, cue_id), 0, .45)
        place(out, wood_hit(.25, 110, .04, cue_id + "drawer"), .25, .55)
    elif cue_id in {"sfx-venue-enter", "sfx-day-advance"}:
        place(out, wood_hit(.22, 125, .06, cue_id), 0, .48)
        place(out, felt_click(.16, cue_id + "latch", .8), .16, .2)
        if cue_id == "sfx-day-advance":
            place(out, paper_noise(.65, cue_id + "calendar"), .45, .32)
            place(out, ledger_mark(.28, cue_id + "mark"), 1.0, .16)
    elif cue_id in {"sfx-market-event", "sfx-market-rise", "sfx-market-fall", "sfx-deadline-warning"}:
        steps = 2 if cue_id != "sfx-market-event" else 3
        for i in range(steps):
            at = i * .09 if cue_id != "sfx-market-fall" else (steps - 1 - i) * .09
            place(out, felt_click(.12, f"{cue_id}{i}", .8), at, .28)
        if "deadline" in cue_id:
            place(out, wood_hit(.24, 105, .03, cue_id + "clock"), .28, .42)
            place(out, paper_noise(.4, cue_id + "notice"), .46, .22)
    elif group == "office":
        if cue_id == "sfx-appraise-start":
            place(out, cloth(min(.45, seconds), cue_id + "cloth"), 0, .16)
            place(out, paper_noise(min(.52, seconds), cue_id), .03, .22)
            place(out, muted_brass(min(.18, seconds), 360, cue_id + "lens"), .14, .07)
            place(out, felt_click(.1, cue_id + "tool", .62), .23, .1)
        elif cue_id == "sfx-appraise-reveal":
            place(out, paper_noise(min(.42, seconds), cue_id), .02, .16)
            place(out, wood_hit(.14, 118, .04, cue_id + "rest"), .16, .18)
            place(out, cloth(min(.34, seconds), cue_id + "cloth"), .24, .1)
        elif cue_id == "sfx-appraise-tool":
            place(out, cloth(min(.28, seconds), cue_id), 0, .16)
            place(out, muted_brass(min(.14, seconds), 340, cue_id + "caliper"), .06, .055)
            place(out, felt_click(.09, cue_id + "rest", .56), .12, .085)
        else:
            place(out, paper_noise(seconds, cue_id), 0, .42)
            place(out, wood_hit(.18, 140, .08, cue_id + "seal"), seconds * .45, .45)
    elif group == "tavern":
        place(out, cloth(seconds, cue_id), 0, .22)
        place(out, muted_brass(min(.28, seconds), 510, cue_id + "token"), .12, .16)
        if "card" in cue_id or "reveal" in cue_id:
            place(out, paper_noise(seconds, cue_id + "note"), 0, .4)
    elif group == "exchange":
        steps = 4 if "graph" in cue_id else 2
        place(out, ratchet(seconds, steps, 300, cue_id), 0, .55)
        if "hanbo" in cue_id or "complete" in cue_id:
            # One of only three sanctioned musical rewards; still felt-damped.
            place(out, muted_brass(min(.5, seconds), 470, cue_id + "fit"), .18, .2)
            if "complete" in cue_id:
                place(out, muted_brass(min(.5, seconds), 590, cue_id + "resolve"), .48, .13)
    elif group == "guild":
        place(out, wood_hit(.3, 82, .04, cue_id), 0, .72)
        place(out, muted_brass(min(.32, seconds), 330, cue_id + "lever"), .12, .15)
        if "loan" in cue_id and seconds > .7:
            place(out, paper_noise(.45, cue_id + "contract"), .4, .2)
            place(out, wood_hit(.2, 118, .05, cue_id + "seal"), .65, .55)
    elif group == "merchant":
        if "inventory" in cue_id:
            place(out, cloth(seconds, cue_id), 0, .35)
            place(out, felt_click(.14, cue_id + "item", .7), .03, .2)
        else:
            place(out, ratchet(seconds, 3 if "ready" in cue_id else 5, 230, cue_id), 0, .48)
            if cue_id == "sfx-upgrade":
                # Sanctioned reward gesture #2: two muted mechanism tones, never a fanfare.
                place(out, muted_brass(.48, 440, cue_id + "a"), .72, .16)
                place(out, muted_brass(.48, 555, cue_id + "b"), 1.04, .11)
            else:
                place(out, felt_click(.14, cue_id + "ready", .8), seconds * .45, .18)
    elif group == "auction":
        if "gavel" in cue_id:
            for i in range(3):
                place(out, wood_hit(.42, 96, .03, f"{cue_id}{i}"), i * .38, .72 - i * .08)
        elif "bid-direct" in cue_id or "bid-jump" in cue_id:
            place(out, ratchet(seconds, 4, 350, cue_id), 0, .6)
        elif "pass" in cue_id:
            place(out, cloth(seconds, cue_id), 0, .28)
            place(out, wood_hit(.2, 155, .05, cue_id + "paddle"), .12, .48)
        elif "lot-next" in cue_id:
            place(out, paper_noise(seconds, cue_id), 0, .48)
            place(out, wood_hit(.16, 210, .12, cue_id + "tag"), .22, .35)
        elif "win" in cue_id:
            place(out, wood_hit(.22, 150, .08, cue_id), 0, .62)
            place(out, ledger_mark(.32, cue_id + "tag"), .16, .22)
        elif "lose" in cue_id or "outbid" in cue_id:
            place(out, wood_hit(.2, 138, .04, cue_id), 0, .38)
            place(out, paper_noise(seconds, cue_id + "ledger"), .14, .18)
        else:
            pitch = 235 if "bot" in cue_id else 300
            place(out, wood_hit(.22, pitch, .08, cue_id), 0, .56)
            if "bot" in cue_id:
                place(out, paper_noise(.16, cue_id + "card"), .04, .16)
            else:
                place(out, felt_click(.13, cue_id + "paddle", .75), .04, .16)
    elif group == "summary":
        if "open" in cue_id:
            place(out, paper_noise(seconds, cue_id), 0, .58)
            place(out, wood_hit(.2, 125, .05, cue_id + "book"), .4, .42)
        elif "ledger-line" in cue_id:
            place(out, ledger_mark(seconds, cue_id), 0, .54)
        elif "profit" in cue_id or "cleared" in cue_id:
            place(out, wood_hit(.18, 150, .08, cue_id), 0, .45)
            place(out, ratchet(min(.5, seconds), 2, 300, cue_id + "balance"), .16, .28)
            place(out, ledger_mark(.3, cue_id + "line"), .38, .18)
        else:
            place(out, paper_noise(seconds, cue_id), 0, .35)
            place(out, wood_hit(.24, 105, .03, cue_id + "red"), .25, .55)
    elif group == "relic":
        if "gavel" in cue_id:
            for i in range(3):
                place(out, wood_hit(.5, 78, .02, f"{cue_id}{i}"), i * .55, .62 - i * .05)
            place(out, cloth(.65, cue_id + "hall"), 1.1, .1)
        elif "reveal" in cue_id or "round-intro" in cue_id:
            place(out, cloth(seconds, cue_id), 0, .36)
            place(out, wood_hit(.42, 104, .03, cue_id + "plinth"), seconds * .42, .42)
            place(out, muted_brass(.32, 315, cue_id + "seal"), seconds * .55, .1)
        elif "acquire" in cue_id:
            place(out, wood_hit(.24, 130, .06, cue_id), 0, .5)
            # Sanctioned reward gesture #3: a sparse sealed-chime dyad.
            for i, p in enumerate((430, 545)):
                place(out, glass_ping(.72, p, f"{cue_id}{i}"), .34 + i * .38, .09)
            place(out, cloth(.65, cue_id + "velvet"), 1.05, .13)
        elif "pass" in cue_id:
            place(out, cloth(seconds, cue_id), 0, .34)
            place(out, wood_hit(.28, 112, .04, cue_id + "paddle"), .18, .48)
        else:
            place(out, wood_hit(.3, 165 if "tycoon" in cue_id else 230, .07, cue_id), 0, .62)
            place(out, felt_click(.18, cue_id + "paddle", .82), .12, .16)
    elif group == "result":
        if "bankruptcy" in cue_id:
            place(out, wood_hit(.5, 72, .01, cue_id), 0, .7)
            place(out, paper_noise(1.0, cue_id + "paper"), .45, .3)
            place(out, wood_hit(.55, 88, .02, cue_id + "drawer"), 1.1, .34)
        else:
            place(out, wood_hit(.24, 145, .08, cue_id), 0, .45)
            place(out, paper_noise(.72, cue_id + "folio"), .22, .25)
            place(out, wood_hit(.3, 118, .04, cue_id + "seal"), .62, .42)
            if "campaign" in cue_id:
                place(out, ledger_mark(.55, cue_id + "signature"), 1.05, .18)
    elif group == "meta":
        place(out, muted_brass(min(.32, seconds), 380, cue_id), 0, .13)
        place(out, wood_hit(.22, 130, .05, cue_id + "plinth"), .18, .44)
        if "unlock" in cue_id:
            place(out, ratchet(min(.8, seconds), 3, 260, cue_id + "lock"), .3, .36)
    else:
        place(out, wood_hit(seconds, 210, .12, cue_id), 0, .6)
    return warm_finish(out)


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def pluck(midi: float, seconds: float, seed: str, brightness: float = .35) -> np.ndarray:
    rng = rng_for(seed)
    f = hz(midi)
    harmonics = tuple((i, (1 / i) * (brightness ** ((i - 1) * .45))) for i in range(1, 7))
    body = pitched(f, seconds, harmonics, 3.2 + midi / 38, rng=rng)
    n = samples(seconds)
    transient = moving_average(rng.normal(0, 1, n), max(2, int(RATE / max(f, 80))))
    transient *= np.exp(-35 * np.arange(n) / RATE) * .12
    return body * .72 + transient


def reed(midi: float, seconds: float, seed: str, dark: bool = False) -> np.ndarray:
    f = hz(midi)
    harmonics = ((1, 1), (2, .16 if dark else .24), (3, .34), (4, .08), (5, .14))
    out = pitched(f, seconds, harmonics, .25, .025, rng_for(seed))
    return out * envelope(seconds, .11, .2) * (.3 if dark else .26)


def string_note(midi: float, seconds: float, seed: str) -> np.ndarray:
    rng = rng_for(seed)
    n = samples(seconds)
    t = np.arange(n) / RATE
    f = hz(midi)
    out = np.zeros(n)
    for detune, amp in ((-.018, .32), (0, .42), (.021, .29)):
        phase = 2 * np.pi * f * (1 + detune) * t + rng.uniform(-1, 1)
        out += amp * (np.sin(phase) + .18 * np.sin(2 * phase) + .08 * np.sin(3 * phase))
    return out * envelope(seconds, .22, .35) * .28


def spinet(midi: float, seconds: float, seed: str) -> np.ndarray:
    return pitched(hz(midi), seconds, ((1, 1), (2, .55), (3, .32), (4, .18)), 2.7, rng=rng_for(seed)) * .36


def vibe(midi: float, seconds: float, seed: str) -> np.ndarray:
    return glass_ping(seconds, hz(midi), seed) * .52


def brush_hit(seconds: float, seed: str, accent: bool = False) -> np.ndarray:
    rng = rng_for(seed)
    n = samples(seconds)
    noise = rng.normal(0, 1, n)
    high = noise - moving_average(noise, 38)
    high = moving_average(high, 6)
    return high * envelope(seconds, .008, seconds * .75) * (.07 if not accent else .11)


MUSIC = {
    "bgm-01-title": (84, "port", [[53,57,60],[50,57,60],[46,53,58],[48,55,60]], [69,72,67,74,72,69]),
    "bgm-02-city": (92, "city", [[53,57,60],[48,55,60],[50,57,62],[46,53,58]], [69,72,74,72,67,69]),
    "bgm-03-auction": (74, "auction", [[50,53,57,60],[48,53,57],[46,50,53],[45,50,55]], [65,62,57,60,62]),
    "bgm-04-relic": (72, "relic", [[50,53,57],[46,50,53],[48,53,57],[53,57,60]], [65,69,72,69,67,65]),
    "bgm-05-settlement": (68, "summary", [[50,53,57],[48,53,57],[46,50,53],[53,57,60]], [62,65,64,57,60]),
    "bgm-06-archive": (64, "memory", [[46,50,53],[43,50,53],[48,53,57],[46,53,58]], [62,65,60,62,58]),
    "bgm-07-loading-workshop": (96, "loading", [[53,57,60],[48,55,60],[50,57,62],[46,53,58]], [65,69,67,72,69]),
    "bgm-08-city-growth": (102, "city", [[46,50,53],[41,48,53],[43,50,55],[48,53,57]], [62,65,67,65,60,62]),
    "bgm-09-city-deadline": (96, "deadline", [[43,46,50],[41,46,50],[48,51,55],[46,50,53]], [58,62,57,64,62,58]),
    "bgm-10-office-appraisal": (78, "office", [[45,48,52],[41,48,53],[43,47,50],[48,52,55]], [60,64,62,67,64]),
    "bgm-11-tavern-whispers": (70, "tavern", [[40,43,47],[45,48,52],[43,47,50],[38,45,50]], [55,59,57,64,59]),
    "bgm-12-exchange-ledger": (98, "exchange", [[48,52,55],[46,50,53],[45,48,52],[43,47,50]], [60,64,67,64,62,60]),
    "bgm-13-guild-vault": (62, "guild", [[36,39,43],[41,44,48],[43,46,50],[36,43,48]], [51,55,53,48,50]),
    "bgm-14-merchant-workshop": (88, "merchant", [[53,57,60],[50,57,62],[45,53,57],[48,55,60]], [57,60,67,64,62,60]),
    "bgm-15-auction-noir": (76, "auction", [[40,43,47,50],[45,48,52],[43,47,50],[38,42,45]], [55,59,57,52,50]),
    "bgm-16-auction-pressure": (80, "auction_pressure", [[36,39,43,46],[41,44,48],[43,46,50],[38,43,46]], [51,48,55,53,50]),
    "bgm-17-settlement-loss": (64, "summary_loss", [[36,39,43],[41,44,48],[43,46,50],[38,43,46]], [60,58,55,52,50]),
    "bgm-18-ending-verdict": (58, "ending", [[38,41,45],[36,41,45],[34,38,41],[41,45,48]], [50,53,57,52,55]),
    "bgm-19-result-success": (76, "success", [[53,57,60,62],[48,55,60],[50,57,62],[46,53,58]], [69,72,74,72,69,67]),
    "bgm-20-result-bankruptcy": (52, "failure", [[38,41,45],[36,41,45],[34,38,41],[33,38,41]], [62,60,57,53,50]),
    "bgm-21-museum-memory": (60, "museum", [[46,50,53,55],[43,50,53],[48,53,57],[46,53,58]], [62,65,70,67,65,62]),
}


def music_layer(track: str, layer: str, seconds: float = 16.0) -> np.ndarray:
    bpm, style, chords, melody = MUSIC[track]
    beat = 60.0 / bpm
    bar = beat * 4
    out = np.zeros(samples(seconds))
    layered = track in {"bgm-03-auction", "bgm-04-relic", "bgm-05-settlement", "bgm-15-auction-noir", "bgm-16-auction-pressure", "bgm-17-settlement-loss"}
    role = layer if layered and layer != "intro" else "FULL"

    # Bass and tactile rhythm.
    if role in {"FULL", "L1"}:
        for i, at in enumerate(np.arange(0, seconds, beat)):
            chord = chords[int(at / bar) % len(chords)]
            bass_midi = chord[0] - (12 if chord[0] > 44 else 0)
            gain = .28 if style.startswith("auction") else .18
            place(out, pluck(bass_midi, min(beat * .92, .75), f"{track}bass{i}", .25), at, gain)
            if style.startswith("auction"):
                place(out, brush_hit(min(.5, beat), f"{track}brush{i}", i % 4 in (1, 3)), at, 1.0)
            elif style in {"city", "loading", "exchange", "merchant", "deadline"} and i % 2 == 1:
                place(out, wood_hit(.07, 260 if style != "deadline" else 360, .12, f"{track}wood{i}"), at, .09)
            elif style.startswith("summary") and i % 2 == 0:
                place(out, paper_noise(.12, f"{track}pencil{i}"), at, .15)

    # Harmony bed / salon chords.
    if role in {"FULL", "L2"}:
        for i, at in enumerate(np.arange(0, seconds, bar)):
            chord = chords[i % len(chords)]
            dur = min(bar * 1.05, seconds - at)
            for j, note in enumerate(chord[-3:]):
                if style.startswith("auction") or style in {"summary", "summary_loss", "exchange", "loading", "office"}:
                    place(out, spinet(note + 12, min(dur, 1.5), f"{track}sp{i}{j}"), at + .04 * j, .10 if style.startswith("auction") else .08)
                else:
                    place(out, string_note(note + 12, dur, f"{track}str{i}{j}"), at, .12)
            if style in {"relic", "museum"}:
                place(out, vibe(chord[-1] + 24, min(1.6, dur), f"{track}v{i}"), at + beat * 1.5, .08)

    # Sparse melodic answers, never a constant lead.
    if role in {"FULL", "L3"}:
        step = beat * (2 if style.startswith("auction") or style in {"tavern", "guild", "ending", "failure", "museum"} else 1.5)
        for i, at in enumerate(np.arange(beat * 1.25, seconds - .2, step)):
            if style.startswith("auction") and i % 2 == 1:
                continue
            note = melody[i % len(melody)]
            dur = min(step * .82, 1.35)
            if style in {"relic", "museum"} and i % 2 == 0:
                sound = vibe(note + 12, dur, f"{track}mel{i}")
                gain = .12
            elif style in {"port", "city", "office", "memory", "success", "merchant"}:
                sound = reed(note + 12, dur, f"{track}mel{i}", False)
                gain = .21
            elif style in {"tavern", "guild", "ending", "failure"} or style.startswith("auction"):
                sound = reed(note, dur, f"{track}mel{i}", True)
                gain = .22
            else:
                sound = spinet(note + 12, dur, f"{track}mel{i}")
                gain = .14
            place(out, sound, at, gain)

    if style == "relic" and role in {"FULL", "L3"}:
        place(out, bell(1.8, 330, track + "ceremony"), seconds * .48, .08)
    if style == "deadline" and role == "FULL":
        for i, at in enumerate(np.arange(.3, seconds, beat * 2)):
            place(out, brass_tick(.08, 680, f"{track}tick{i}"), at, .035)
    if layer == "intro":
        out *= np.linspace(.18, 1.0, len(out))
    edge = min(samples(.08), len(out) // 3)
    out[:edge] *= np.linspace(0, 1, edge)
    out[-edge:] *= np.linspace(1, 0, edge)
    return out


def normalize(x: np.ndarray, peak: float) -> np.ndarray:
    x = np.nan_to_num(x)
    maximum = float(np.max(np.abs(x))) if x.size else 0.0
    if maximum > 1e-9:
        x = x / maximum * peak
    return np.clip(x, -1.0, 1.0)


def write_wav(path: Path, signal: np.ndarray, stereo: bool = False, peak: float | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    signal = normalize(signal, peak if peak is not None else (.5 if stereo else .68))
    if stereo:
        delay = 23
        right = np.zeros_like(signal)
        right[delay:] = signal[:-delay] * .93
        right += moving_average(signal, 31) * .07
        pcm = (np.column_stack([signal, right]) * 32767).astype("<i2")
        channels = 2
    else:
        pcm = (signal * 32767).astype("<i2")
        channels = 1
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes(pcm.tobytes())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="overwrite existing prototype WAV files")
    parser.add_argument("--bgm-only", action="store_true", help="refresh only BGM prototypes")
    parser.add_argument("--sfx-only", action="store_true", help="refresh SFX/ambience only; never touch approved BGM masters")
    parser.add_argument("--keep-auction-jazz", action="store_true", help="keep existing auction files (normally false in v3 because the jazz is developed)")
    parser.add_argument("--cue", action="append", default=[], help="refresh only the named SFX/ambience cue; repeatable")
    args = parser.parse_args()
    sound = json.loads((ROOT / "sound" / "sound.json").read_text(encoding="utf-8"))
    counts = {"sfx": 0, "ambience": 0, "bgm": 0}
    for cue in sound["sfx"]:
        folder = "ambience" if cue.get("loop") else "sfx"
        target = AUDIO / folder / f"{cue['id']}.wav"
        selected = not args.cue or cue["id"] in args.cue
        if selected and not args.bgm_only and (args.force or not target.exists()):
            is_loop = bool(cue.get("loop"))
            if is_loop:
                render_peak = .32
            elif cue["id"] in {"sfx-appraise-start", "sfx-appraise-reveal", "sfx-appraise-tool"}:
                render_peak = .40
            elif cue["id"] in {"sfx-ui-hover", "sfx-settings-tick", "sfx-ui-focus", "sfx-ui-number-step"}:
                render_peak = .42
            elif cue.get("accent"):
                render_peak = .58
            else:
                render_peak = .52
            rendered = synth_cue(cue)
            rendered = cc0_foley_layer(cue, rendered)
            write_wav(target, rendered, stereo=is_loop, peak=render_peak)
        counts[folder] += 1

    slots: list[tuple[str, str]] = []
    for item in sound["bgm"]:
        if item.get("structure", {}).get("intro"):
            slots.append((item["id"], "intro"))
        layers = [layer["id"] for layer in (item.get("layers") or [])]
        slots.extend((item["id"], layer) for layer in (layers or ["loop"]))
    for track, layer in slots:
        target = AUDIO / "bgm" / f"{track}__{layer}.wav"
        keep = args.keep_auction_jazz and track in {"bgm-03-auction", "bgm-15-auction-noir", "bgm-16-auction-pressure"}
        generate_bgm = not args.sfx_only and not args.cue
        if generate_bgm and not keep and (args.force or not target.exists()):
            write_wav(target, music_layer(track, layer), stereo=True)
        counts["bgm"] += 1

    manifest = {
        "schemaVersion": "prototype-audio-3.6-cc0-foley-clarity",
        "notice": "INTERACTIVE MIX — CC0 real Foley is layered with procedural support; source pages are recorded in sound/sound.json.",
        "sampleRate": RATE,
        "direction": "bright harbor / antique shop / clockwork clarity: real wood, metal, paper, coin, lock and mechanical transients with restrained procedural body",
        "counts": counts,
        "replacementContract": "sound/sound.json",
    }
    (AUDIO / "prototype-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not args.bgm_only:
        sound["sfxRefitProgram"] = {
            "version": "3.6",
            "direction": "빈티지 항구·골동품·태엽 장치의 실물 어택을 선명하게, 합성 몸통은 짧고 낮게 보조",
            "mixPolicy": "CC0 Foley 70~80% + procedural support 20~30%; accent cues keep more body, no modern UI beep",
            "sourceFamilies": [
                {
                    "title": "100 CC0 metal and wood SFX",
                    "author": "rubberduck",
                    "license": "CC0",
                    "sourcePage": "https://opengameart.org/content/100-cc0-metal-and-wood-sfx",
                },
                {
                    "title": "Book Flip Sounds",
                    "author": "Voltiment555",
                    "license": "CC0",
                    "sourcePage": "https://opengameart.org/content/book-flip-sounds",
                },
                {
                    "title": "RPG Sound Pack",
                    "author": "artisticdude",
                    "license": "CC0",
                    "sourcePage": "https://opengameart.org/content/rpg-sound-pack",
                },
                {
                    "title": "Mechanical Sounds",
                    "author": "BMacZero",
                    "license": "CC0",
                    "sourcePage": "https://opengameart.org/content/mechanical-sounds",
                },
                {
                    "title": "Various Sound Effects",
                    "author": "laleksic",
                    "license": "CC0",
                    "sourcePage": "https://opengameart.org/content/various-sound-effects",
                },
                {
                    "title": "Ticking clock",
                    "author": "bart",
                    "license": "CC0",
                    "sourcePage": "https://opengameart.org/content/ticking-clock",
                },
            ],
            "banks": {name: len(paths) for name, paths in FOLEY_BANKS.items()},
        }
        for cue in sound["sfx"]:
            cue["prototypeSourceFamily"] = "clock" if cue.get("loop") and cue["id"] in {"amb-loading-gears", "amb-deadline-tick"} else foley_bank_for(cue)
        sound_path = ROOT / "sound" / "sound.json"
        sound_path.write_text(json.dumps(sound, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (AUDIO / "sound-runtime.js").write_text(
            "window.UNKNOWN_AUCTION_SOUND = " + json.dumps(sound, ensure_ascii=False, indent=2) + ";\n",
            encoding="utf-8",
        )
        runpy.run_path(str(ROOT / "tools" / "sync_vsl_sound_editor.py"), run_name="__main__")
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()

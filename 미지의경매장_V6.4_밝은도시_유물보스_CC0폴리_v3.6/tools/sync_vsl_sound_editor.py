#!/usr/bin/env python3
"""Refresh the already-patched VSL editor from the current sound contract."""

from __future__ import annotations

import json
import re
import runpy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "tools" / "visual_spec_lite_v5_3_sound.html"
PATCHER = ROOT / "sound" / "patch-vsl.py"
SOUND_JSON = ROOT / "sound" / "sound.json"
FLOW_JSON = ROOT / "flow.json"
RUNTIME_JS = ROOT / "assets" / "runtime" / "audio" / "sound-runtime.js"


def replace_once(text: str, old: str, new: str) -> str:
    if old not in text:
        return text
    return text.replace(old, new, 1)


def sync_contract_files() -> tuple[dict, int, int]:
    """Make sound.json the single authority for runtime, flow, and VSL mappings."""
    sound = json.loads(SOUND_JSON.read_text(encoding="utf-8"))
    flow = json.loads(FLOW_JSON.read_text(encoding="utf-8"))
    scene_map = sound.get("sceneBgmMap", {})
    ambience_map = sound.get("sceneAmbienceMap", {})
    action_map = sound.get("actionSfxMap", {})
    synced = 0
    synced_actions = 0
    for node in flow.get("nodes", []):
        mapping = scene_map.get(node.get("id"))
        if not mapping:
            continue
        previous = node.get("sound") or {}
        node["sound"] = {
            **previous,
            "bgm": mapping.get("bgm"),
            "ambience": ambience_map.get(node.get("id")),
            "layers": mapping.get("layers"),
            "layersOnSuccess": None,
            "runtimeVariants": mapping.get("variants", []),
            "mappingAuthority": "sound/sound.json",
        }
        synced += 1

    def sync_action_refs(value: object) -> None:
        nonlocal synced_actions
        if isinstance(value, dict):
            action_ref = value.get("actionRef")
            mapped_cue = action_map.get(action_ref)
            if mapped_cue:
                value["soundCue"] = mapped_cue
                value["soundMappingAuthority"] = "sound/sound.json actionSfxMap"
                synced_actions += 1
            for child in value.values():
                sync_action_refs(child)
        elif isinstance(value, list):
            for child in value:
                sync_action_refs(child)

    sync_action_refs(flow)

    flow["soundContract"] = {
        "schemaVersion": "sound-contract-2.0",
        "version": sound["version"],
        "path": "sound/sound.json",
        "runtimeConfig": "assets/runtime/audio/sound-runtime.js",
        "mappingAuthority": "sound/sound.json",
        "prototypeAudio": False,
    }
    FLOW_JSON.write_text(json.dumps(flow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    RUNTIME_JS.write_text(
        "window.UNKNOWN_AUCTION_SOUND = "
        + json.dumps(sound, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    return sound, synced, synced_actions


def main() -> None:
    sound, synced_nodes, synced_actions = sync_contract_files()
    data = runpy.run_path(str(PATCHER))["build_sound_data"]()
    text = HTML.read_text(encoding="utf-8")
    payload = json.dumps(data, ensure_ascii=False)
    text, count = re.subn(
        r"  const (?:EMBEDDED_)?SOUND_DATA = .*?;\n(?:  let SOUND_DATA = .*?;\n)?(?:  const SOUND_REV = .*?;\n)?  (?:const|let) soundFiles",
        "  const EMBEDDED_SOUND_DATA = " + payload + ";\n"
        "  let SOUND_DATA = JSON.parse(JSON.stringify(EMBEDDED_SOUND_DATA));\n"
        "  let soundFiles",
        text,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise RuntimeError("SOUND_DATA block not found")

    text = re.sub(
        r"v5\.3(?:\.1)? · [^<]+",
        "v5.3.1 · ZIP Sound Link Fix · Audio v3.6",
        text,
        count=1,
    )

    text, count = re.subn(
        r'  const SOUND_REV = ".*?";\n',
        '  const SOUND_REV = ' + json.dumps(sound["version"]) + ';\n',
        text,
        count=1,
    )
    if count == 0:
        text = text.replace(
            "  let soundFiles = {};",
            "  const SOUND_REV = " + json.dumps(sound["version"]) + ";\n  let soundFiles = {};",
            1,
        )
    text = re.sub(
        r'return `\$\{url\}\?soundRev=[^`]+`;',
        'return `${url}?soundRev=${encodeURIComponent(SOUND_REV)}`;',
        text,
        count=1,
    )

    if "function soundSlotsForBgm" not in text:
        text = replace_once(
            text,
            "  function soundCueById(id) {\n    return SOUND_DATA.cues.find(c => c.id === id) || SOUND_DATA.bgm.find(b => b.id === id) || null;\n  }",
            "  function soundCueById(id) {\n    return SOUND_DATA.cues.find(c => c.id === id) || SOUND_DATA.bgm.find(b => b.id === id) || null;\n  }\n\n"
            "  function soundSlotsForBgm(id) {\n    const b = SOUND_DATA.bgm.find(x => x.id === id);\n    return b ? (b.slots || (b.layers.length ? b.layers.map(l => b.id + '__' + l) : [b.id + '__loop'])) : [];\n  }\n\n"
            "  function soundAllSlots() {\n    return SOUND_DATA.cues.map(c => c.id).concat(SOUND_DATA.bgm.flatMap(b => soundSlotsForBgm(b.id)));\n  }",
        )

    text = replace_once(
        text,
        "    const all = SOUND_DATA.cues.map(c => c.id).concat(SOUND_DATA.bgm.map(b => b.id));",
        "    const all = soundAllSlots();",
    )
    text = replace_once(
        text,
        "    const total = SOUND_DATA.cues.length;\n    const done = SOUND_DATA.cues.filter(c => soundFiles[c.id]).length;",
        "    const all = soundAllSlots();\n    const total = all.length;\n    const done = all.filter(id => soundFiles[id]).length;",
    )
    text = replace_once(
        text,
        "      soundPlay(soundFiles[id] ? id : id + \"__loop\");",
        "      const slot = soundSlotsForBgm(id).find(key => soundFiles[key]);\n      soundPlay(slot || id);",
    )
    text = replace_once(
        text,
        "      const slots = b.layers.length ? b.layers.map(l => b.id + \"__\" + l) : [b.id + \"__loop\"];",
        "      const slots = soundSlotsForBgm(b.id);",
    )
    text = replace_once(
        text,
        "    const missing = SOUND_DATA.cues.filter(c => !soundFiles[c.id]).map(c => c.id);",
        "    const missing = soundAllSlots().filter(id => !soundFiles[id]);",
    )
    HTML.write_text(text, encoding="utf-8")
    print(
        f"Sound pipeline synced: {synced_nodes} scenes, {synced_actions} actions, "
        f"{len(data['bgm'])} BGM, {len(data['cues'])} cues, {sound['version']}"
    )


if __name__ == "__main__":
    main()

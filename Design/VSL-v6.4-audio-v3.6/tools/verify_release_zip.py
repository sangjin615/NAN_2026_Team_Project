#!/usr/bin/env python3
"""Verify that the packaged VSL and HTML runtime share one sound contract."""

from __future__ import annotations

import hashlib
import io
import json
import sys
import wave
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    candidates = sorted(ROOT.parent.glob("*v3.6.zip"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not candidates:
        raise SystemExit("v3.4 release ZIP not found")
    zip_path = candidates[0]

    with zipfile.ZipFile(zip_path) as archive:
        names = set(archive.namelist())
        sound = json.loads(archive.read("sound/sound.json").decode("utf-8"))
        flow = json.loads(archive.read("flow.json").decode("utf-8"))
        runtime = archive.read("assets/runtime/audio/sound-runtime.js").decode("utf-8")
        vsl = archive.read("tools/visual_spec_lite_v5_3_sound.html").decode("utf-8")
        manager = archive.read("assets/runtime/audio/audio-manager.js").decode("utf-8")
        manifest = json.loads(archive.read("assets/runtime/audio/prototype-manifest.json").decode("utf-8"))

        flow_map = {node["id"]: node.get("sound", {}) for node in flow["nodes"]}
        mismatches = [
            (scene_id, mapping["bgm"], flow_map.get(scene_id, {}).get("bgm"))
            for scene_id, mapping in sound["sceneBgmMap"].items()
            if flow_map.get(scene_id, {}).get("bgm") != mapping["bgm"]
        ]
        if mismatches:
            raise AssertionError(f"scene mapping mismatch: {mismatches}")
        ambience_mismatches = [
            (scene_id, cue_id, flow_map.get(scene_id, {}).get("ambience"))
            for scene_id, cue_id in sound["sceneAmbienceMap"].items()
            if flow_map.get(scene_id, {}).get("ambience") != cue_id
        ]
        if ambience_mismatches:
            raise AssertionError(f"scene ambience mismatch: {ambience_mismatches}")

        assert sound["version"] in runtime and sound["version"] in vsl
        assert sound["version"] == "6.4-sound-3.6-bright-city-relic-boss-foley"
        assert sound["sfxRefitProgram"]["version"] == "3.6"
        assert sound["selectedBgmProgram"]["version"] == "3.6"
        assert len(sound["selectedBgmProgram"]["tracks"]) == 10
        city_program = next(item for item in sound["selectedBgmProgram"]["tracks"] if item["programId"] == "02_city")
        assert "bright city refit" in city_program["editProfile"]
        assert manifest["schemaVersion"] == "prototype-audio-3.6-cc0-foley-clarity"
        assert "March of the Spoons" in runtime and "Court of the Queen" in runtime
        assert "sound/sound.json" in vsl and "sceneBgmMap" in vsl
        assert "findSoundEntry" in vsl and "soundLoadZipEntries" in vsl
        assert "ZIP Sound Link Fix" in vsl
        assert "Audio v3.6" in vsl
        assert '!key.endsWith("__intro")' in vsl
        assert "?soundRev=${soundRevision}" in manager
        assert "duckBgmForCue" in manager and "bgmDuckGain" in manager
        assert "sound/source-bgm/03_workplace_march_of_the_spoons.mp3" in names
        assert "sound/source-bgm/06_relic_court_of_the_queen.mp3" in names
        assert "sound/source-bgm/03_workplace_duet_musette.mp3" not in names
        assert "sound/source-bgm/06_relic_long_road_ahead_b.mp3" not in names

        audio_files = [
            "assets/runtime/audio/bgm/bgm-10-office-appraisal__loop.wav",
            "assets/runtime/audio/bgm/bgm-04-relic__L1.wav",
        ]
        for name in audio_files:
            with wave.open(io.BytesIO(archive.read(name)), "rb") as audio:
                assert audio.getnchannels() == 2
                assert audio.getframerate() == 44_100
                assert round(audio.getnframes() / audio.getframerate(), 3) == 36.0

        cue_files = {
            cue["id"]: f"assets/runtime/audio/{'ambience' if cue.get('loop') else 'sfx'}/{cue['id']}.wav"
            for cue in sound["sfx"]
        }
        assert len(cue_files) == 110
        action_map = sound["actionSfxMap"]
        action_bindings = []

        def collect_action_bindings(value):
            if isinstance(value, dict):
                if value.get("actionRef"):
                    action_bindings.append((value["actionRef"], value.get("soundCue")))
                for child in value.values():
                    collect_action_bindings(child)
            elif isinstance(value, list):
                for child in value:
                    collect_action_bindings(child)

        collect_action_bindings(flow)
        assert len(action_bindings) == 76
        assert all(action_map.get(action_ref) == sound_cue for action_ref, sound_cue in action_bindings)
        cue_by_id = {cue["id"]: cue for cue in sound["sfx"]}
        assert cue_by_id["sfx-appraise-start"]["gain"] == -14
        assert cue_by_id["sfx-appraise-reveal"]["gain"] == -14
        assert cue_by_id["sfx-appraise-tool"]["gain"] == -17
        assert all(path in names for path in cue_files.values())
        assert hashlib.sha256(archive.read(cue_files["sfx-ui-click"])).digest() != hashlib.sha256(
            archive.read(cue_files["sfx-bid-place"])
        ).digest()
        assert len({hashlib.sha256(archive.read(path)).digest() for path in cue_files.values() if "/sfx/" in path}) == 99
        assert sound["sceneBgmMap"]["scene-continue"]["bgm"] == "bgm-01-title"
        assert sound["sceneBgmMap"]["scene-merchant"]["bgm"] == "bgm-06-archive"
        assert sound["sceneBgmMap"]["scene-exchange"]["bgm"] == "bgm-14-merchant-workshop"
        assert sound["sceneBgmMap"]["scene-guild"]["bgm"] == "bgm-13-guild-vault"
        assert sound["sceneBgmMap"]["scene-final"]["bgm"] == "bgm-04-relic"
        assert hashlib.sha256(archive.read("assets/runtime/audio/bgm/bgm-01-title__loop.wav")).digest() != hashlib.sha256(
            archive.read("assets/runtime/audio/bgm/bgm-06-archive__loop.wav")
        ).digest()
        with wave.open(io.BytesIO(archive.read(cue_files["amb-auction-crowd"])), "rb") as ambience:
            assert ambience.getnchannels() == 2
            assert ambience.getframerate() == 44_100

    print("ZIP_PIPELINE=PASS")
    print(f"ZIP_FILE={zip_path}")
    print(f"ZIP_FILES={len(names)}")
    print(f"ZIP_SHA256={hashlib.sha256(zip_path.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()

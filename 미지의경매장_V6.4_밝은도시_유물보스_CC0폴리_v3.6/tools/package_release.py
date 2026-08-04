#!/usr/bin/env python3
"""Create the clean expanded-sound release ZIP."""

import runpy
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT.parent / "미지의경매장_V6.4_밝은도시_유물보스_CC0폴리_v3.6.zip"
EXCLUDED_PARTS = {"__pycache__", "_vendor", "chrome-smoke-profile", "chrome-cdp-profile", "source-sfx", "__MACOSX"}
EXCLUDED_NAMES = {
    "browser-smoke.png",
    "Thumbs.db",
    ".DS_Store",
    "03_workplace_duet_musette.mp3",
    "06_relic_long_road_ahead_b.mp3",
    "SOUND-CREDITS-v3.1.md",
}

# Packaging is also a synchronization boundary: the ZIP can never contain a
# stale flow.json or VSL mapping relative to sound/sound.json.
runpy.run_path(str(ROOT / "tools" / "sync_vsl_sound_editor.py"), run_name="__main__")

files = [
    path
    for path in ROOT.rglob("*")
    if path.is_file()
    and not (set(path.relative_to(ROOT).parts) & EXCLUDED_PARTS)
    and path.name not in EXCLUDED_NAMES
]

with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED, compresslevel=7) as archive:
    for path in sorted(files, key=lambda item: str(item).lower()):
        archive.write(path, path.relative_to(ROOT).as_posix())

print(f"{OUTPUT}\nFILES={len(files)}\nBYTES={OUTPUT.stat().st_size}")

#!/usr/bin/env python3
import sys
import zipfile
from pathlib import Path

if len(sys.argv) != 4:
    raise SystemExit(
        "usage: inject-vsl-tools-into-project.py SOURCE_ZIP TOOL_ROOT OUTPUT_ZIP"
    )

source_zip, tool_root, output_zip = map(Path, sys.argv[1:4])
tool_files = {
    "tools/visual_spec_lite_v5_3_sound_9slice.html": tool_root / "tools/visual_spec_lite_v5_3_sound_9slice.html",
    "tools/clean-ui-preset.js": tool_root / "tools/clean-ui-preset.js",
    "VSL_레이아웃_9SLICE_실행.html": tool_root / "VSL_레이아웃_9SLICE_실행.html",
    "VSL_사운드편집기_실행.html": tool_root / "VSL_사운드편집기_실행.html",
    "9SLICE-QUICKSTART.md": tool_root / "9SLICE-QUICKSTART.md",
    "CLEAN-UI-VSL-README.md": tool_root / "CLEAN-UI-VSL-README.md",
    "VSL-TOOL-README.md": tool_root / "README.md",
}

for archive_name, file_path in tool_files.items():
    if not file_path.is_file():
        raise FileNotFoundError(file_path)

with zipfile.ZipFile(source_zip, "r") as source:
    replaced = set(tool_files)
    with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=7) as target:
        for info in source.infolist():
            if info.filename not in replaced:
                target.writestr(info, source.read(info.filename))
        for archive_name, file_path in tool_files.items():
            target.write(file_path, archive_name)

print(output_zip)

#!/usr/bin/env python3
import json
import sys
import zipfile
from pathlib import Path

source_zip, base_layout_path, output_zip = map(Path, sys.argv[1:4])
base = json.loads(base_layout_path.read_text(encoding="utf-8-sig"))

with zipfile.ZipFile(source_zip, "r") as source:
    exported = json.loads(source.read("layout.json").decode("utf-8-sig"))

    def merge_groups(group_key, owner_key):
        base_groups = {group.get(owner_key): group for group in base.get(group_key, [])}
        for group in exported.get(group_key, []):
            original_group = base_groups.get(group.get(owner_key), {})
            original_elements = {
                element.get("id"): element for element in original_group.get("elements", [])
            }
            group["elements"] = [
                {**original_elements.get(element.get("id"), {}), **element}
                for element in group.get("elements", [])
            ]

    merge_groups("sceneLayouts", "sceneId")
    merge_groups("uiLayouts", "uiStateId")

    layout_bytes = (json.dumps(exported, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=7) as target:
        for info in source.infolist():
            if info.filename == "layout.json":
                target.writestr(info, layout_bytes)
            else:
                target.writestr(info, source.read(info.filename))

print(output_zip)

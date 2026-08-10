#!/usr/bin/env python3
"""Generate the human-readable expanded BGM program from sound.json."""

import json
from pathlib import Path


HERE = Path(__file__).parent
S = json.loads((HERE / "sound.json").read_text(encoding="utf-8"))


def slots(item):
    out = []
    if item.get("structure", {}).get("intro"):
        out.append(item["id"] + "__intro")
    layers = [layer["id"] for layer in (item.get("layers") or [])]
    out.extend(item["id"] + "__" + layer for layer in (layers or ["loop"]))
    return out


def main():
    p = S["musicProgram"]
    out = [
        "# 확장형 BGM 프로그램",
        "",
        "`sound.json`의 사람이 읽는 판본입니다. 이 파일은 직접 고치지 않고 `sound.json`과 이 생성기를 수정합니다.",
        "",
        "## 핵심 원칙",
        "",
        "- " + p["principle"],
        "- 선택 입력: " + " · ".join(p["selectionInputs"]),
        "- 금지 입력: " + " · ".join(p["forbiddenInputs"]),
        "- 연속성: " + p["continuity"],
        "",
        "## 씬별 선택",
        "",
        "| 씬 | 기본 곡 | 공개 상태 변주 |",
        "|---|---|---|",
    ]
    for scene, mapping in S["sceneBgmMap"].items():
        variants = []
        for variant in mapping.get("variants", []):
            variants.append("`%s` ← %s" % (variant["bgm"], json.dumps(variant.get("when", {}), ensure_ascii=False)))
        out.append("| `%s` | `%s` | %s |" % (scene, mapping["bgm"], "<br>".join(variants) or "—"))

    out += [
        "",
        "## 전체 곡",
        "",
        "총 **%d곡**, 납품 슬롯 **%d개**." % (len(S["bgm"]), sum(len(slots(item)) for item in S["bgm"])),
        "",
        "| ID | 곡명 | BPM/조성 | 역할 | 슬롯 |",
        "|---|---|---|---|---|",
    ]
    for item in S["bgm"]:
        out.append("| `%s` | %s | %s / %s | %s | %s |" % (
            item["id"], item["name"], item["bpm"], item["key"], item["character"],
            " · ".join("`%s`" % slot for slot in slots(item))))

    out += ["", "## AI/작곡 프롬프트", ""]
    for item in S["bgm"]:
        out += ["### %s · `%s`" % (item["name"], item["id"]), "", item["generationPrompt"], ""]

    (HERE / "BGM-SPEC.md").write_text("\n".join(out), encoding="utf-8")
    print("BGM-SPEC.md written: %d tracks" % len(S["bgm"]))


if __name__ == "__main__":
    main()

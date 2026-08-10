#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""무료 에셋 사이트에서 검색할 때 쓰는 쇼핑 리스트를 만든다.

    python build-shopping-list.py

sound.json의 큐 목록과 import-audio.py의 KEYWORDS를 합쳐 SFX-SHOPPING-LIST.md를 뽑는다.
검색어를 고치려면 import-audio.py의 KEYWORDS를 고친다 — 그래야 나중에
파일명 자동 매칭에도 같은 낱말이 쓰인다.
"""
import importlib.util
import json
import pathlib
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = pathlib.Path(__file__).parent

spec = importlib.util.spec_from_file_location("imp_audio", HERE / "import-audio.py")
mod = importlib.util.module_from_spec(spec)
sys.argv = ["x"]
spec.loader.exec_module(mod)
KEYWORDS = mod.KEYWORDS

S = json.loads((HERE / "sound.json").read_text(encoding="utf-8"))

GROUPS = {
    "ui": "공용 UI 팔레트", "entry": "진입·저장", "loading": "여정 생성",
    "city": "도시·거점", "office": "의뢰소", "tavern": "술집",
    "exchange": "거래소", "guild": "조합", "merchant": "상회",
    "auction": "경매 세션", "summary": "하루 결산", "relic": "유물 경매",
    "result": "여정 결과", "meta": "전시관",
}

# 큐 성격별로 가장 잘 맞는 사이트
SITE = {
    "ui": "Kenney UI Audio (CC0) → 없으면 Freesound CC0",
    "entry": "Sonniss GDC · Freesound CC0",
    "loading": "Freesound CC0 (loop 태그)",
    "city": "Sonniss GDC · Freesound CC0",
    "office": "Freesound CC0",
    "tavern": "Freesound CC0",
    "exchange": "Freesound CC0 · Kenney (chime)",
    "guild": "Sonniss GDC (metal/vault)",
    "merchant": "Kenney (chime) · Freesound CC0",
    "auction": "Sonniss GDC · Freesound CC0",
    "summary": "Freesound CC0",
    "relic": "Sonniss GDC · Pixabay (orchestral hit)",
    "result": "Sonniss GDC · Pixabay",
    "meta": "Freesound CC0",
}


def main():
    groups = {}
    for c in S["sfx"]:
        groups.setdefault(c["group"], []).append(c)

    out = [
        "# SFX 무료 에셋 쇼핑 리스트",
        "",
        "`sound.json` + `import-audio.py`의 검색어에서 자동 생성. 손으로 고치지 않는다.",
        "",
        "## 쓰는 법",
        "",
        "1. 아래 검색어로 사이트에서 찾는다 (라이선스는 `FREE-SOURCES.md` 참조)",
        "2. 받은 파일을 **큐 ID로 이름을 바꿔** 한 폴더에 모은다 — 예: `sfx-gavel.wav`",
        "3. VSL의 **사운드 보관함 → 오디오 폴더 연결** 을 누르면 전부 자동 배정된다",
        "",
        "이름 바꾸기가 번거로우면 받은 파일 그대로 두고 `python import-audio.py <폴더>` 를 돌린다.",
        "파일명에 검색어가 남아 있으면 어느 큐인지 제안해 준다.",
        "",
        "★ = 강조 큐. 이 12개는 시간을 더 써서 좋은 걸 고를 값어치가 있다.",
        "",
        "---",
    ]

    for gid, items in groups.items():
        out += [
            "",
            "## %s (%d)" % (GROUPS.get(gid, gid), len(items)),
            "",
            "> 추천: %s" % SITE.get(gid, "Freesound CC0"),
            "",
            "| 큐 ID | 원하는 소리 | 길이 | 검색어 |",
            "|---|---|---|---|",
        ]
        for c in items:
            fallback = [w for w in c["id"].replace("sfx-", "").replace("amb-", "").split("-") if w]
            kw = " · ".join("`%s`" % w for w in KEYWORDS.get(c["id"], fallback))
            out.append(
                "| `%s`%s | %s | %.2fs%s | %s |"
                % (
                    c["id"],
                    " ★" if c.get("accent") else "",
                    c["desc"],
                    c["durationSec"],
                    " loop" if c.get("loop") else "",
                    kw or "—",
                )
            )

    out += [
        "",
        "---",
        "",
        "## 배경음악 %d곡" % len(S["bgm"]),
        "",
        "| 슬롯 | 성격 | 검색어 |",
        "|---|---|---|",
    ]
    for b in S["bgm"]:
        layers = [l["id"] for l in (b.get("layers") or [])]
        slots = ["%s__%s" % (b["id"], l) for l in layers] or ["%s__loop" % b["id"]]
        out.append(
            "| %s | %s | %s |"
            % (" · ".join("`%s`" % s for s in slots), b["character"][:44],
               b.get("generationPrompt", "")[:110])
        )

    out += [
        "",
        "**레이어 곡 주의** — 무료 음원으로는 스템을 구할 수 없다. "
        "`FREE-SOURCES.md`의 「스템 없이 레이어 구현하기」를 먼저 읽을 것.",
        "",
    ]

    (HERE / "SFX-SHOPPING-LIST.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    print("SFX-SHOPPING-LIST.md written: %d cues" % len(S["sfx"]))


if __name__ == "__main__":
    main()

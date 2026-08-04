#!/usr/bin/env python3
"""sound.json -> SFX-CUESHEET.md 생성.

sound.json이 단일 기준이므로 큐시트는 손으로 고치지 않고 이 스크립트로 다시 뽑는다.
    python build-cuesheet.py
"""
import json
import pathlib
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = pathlib.Path(__file__).parent
S = json.loads((HERE / "sound.json").read_text(encoding="utf-8"))

GROUP_NAMES = {
    "ui": "공용 UI 팔레트",
    "entry": "진입·저장",
    "loading": "여정 생성",
    "city": "도시·거점",
    "office": "의뢰소",
    "tavern": "술집",
    "exchange": "거래소",
    "guild": "조합",
    "merchant": "상회",
    "auction": "경매 세션",
    "summary": "하루 결산",
    "relic": "유물 경매",
    "result": "여정 결과",
    "meta": "전시관",
}

# 행동·UI상태에 직접 걸리지 않고 조건으로만 울리는 큐의 설명
CONDITIONAL = {
    "sfx-ui-hover": "모든 상호작용 핀 위에 커서가 올라갈 때",
    "sfx-ui-disabled": "비활성 핀 클릭. 보관칸 초과로 입찰이 봉쇄된 경우 포함",
    "sfx-coin-gain": "player.cash 증가하는 모든 행동에 겹쳐 재생",
    "sfx-coin-spend": "player.cash 감소하는 모든 행동에 겹쳐 재생",
    "sfx-settings-tick": "설정 창의 슬라이더·다이얼 조작 중 연속",
    "sfx-title-logo": "scene-title 진입 시 로고 등장 연출",
    "sfx-slot-select": "scene-continue 슬롯 목록에서 슬롯 선택",
    "amb-loading-gears": "scene-loading 체류 중 상시 루프",
    "amb-deadline-tick": "마감 일차(4·7·10일차) 개시 전날부터 도시 페이즈 상시 루프",
    "sfx-market-event": "scene-city 「오늘 시장 사건」 표시 시",
    "sfx-hanbo-complete": "족보 성립 시 ★ 행동 미정의 — 제안 ID act-form-hanbo",
    "sfx-outbid": "act-run-bot-turn 결과로 내가 최고 호가를 잃었을 때, sfx-bid-bot 0.15s 후",
    "amb-auction-crowd": "scene-auction 체류 중 상시 루프",
    "sfx-summary-open": "scene-summary 진입 시",
    "sfx-ledger-line": "결산 항목이 한 줄씩 나타날 때마다",
    "sfx-profit": "scene-summary 진입 시 오늘 순이익 >= 0",
    "sfx-loss": "scene-summary 진입 시 오늘 순이익 < 0",
    "sfx-relic-acquire": "act-finish-relic-auction 결과가 낙찰일 때, sfx-relic-gavel 0.9s 후",
    "sfx-result-success": "scene-result 진입 시 여정 성공",
}


def build_reverse_map():
    rev = {}
    for action, cue in S["actionSfxMap"].items():
        if cue:
            rev.setdefault(cue, []).append("`%s`" % action)
    for uid, m in S["uiStateSfxMap"].items():
        if not isinstance(m, dict):
            continue
        for key, label in (("open", "열림"), ("close", "닫힘")):
            cue = m.get(key)
            if cue:
                rev.setdefault(cue, []).append("`%s` %s" % (uid, label))
    for item in S.get("conditionalCues", []):
        rev.setdefault(item["cue"], []).append(item.get("when", "조건부 재생"))
    return rev


def main():
    rev = build_reverse_map()
    groups = {}
    for cue in S["sfx"]:
        groups.setdefault(cue["group"], []).append(cue)

    accent = sum(1 for c in S["sfx"] if c.get("accent"))
    loops = sum(1 for c in S["sfx"] if c.get("loop"))

    out = [
        "# SFX 큐시트",
        "",
        "`sound.json` -> `sfx[]` 의 사람이 읽는 판본.",
        "**이 파일은 손으로 고치지 않는다.** `sound.json`을 고치고 `python build-cuesheet.py`로 다시 뽑는다.",
        "",
        "총 **%d개** 큐 · 강조 %d개 · 루프 %d개" % (len(S["sfx"]), accent, loops),
        "",
        "★ = 강조 큐. −14 LUFS, 덕킹 대상이거나 멜로디가 허용된 예외.",
        "",
    ]

    for gid, items in groups.items():
        out.append("")
        out.append("## %s (%d)" % (GROUP_NAMES.get(gid, gid), len(items)))
        out.append("")
        out.append("| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |")
        out.append("|---|---|---|---|---|---|")
        for c in items:
            trig = rev.get(c["id"], [])
            if trig:
                text = ", ".join(trig[:3])
                if len(trig) > 3:
                    text += " 외 %d건" % (len(trig) - 3)
            else:
                text = CONDITIONAL.get(c["id"], "미정")
            out.append(
                "| `%s`%s | %s | %s | %.2fs%s | %ddB | %s |"
                % (
                    c["id"],
                    " ★" if c.get("accent") else "",
                    c["name"],
                    c["desc"],
                    c["durationSec"],
                    " loop" if c.get("loop") else "",
                    c["gain"],
                    text,
                )
            )

    dep = S["deprecated"]
    out += [
        "",
        "",
        "## 큐를 만들지 않는 행동 (V6 폐기·보류)",
        "",
        "| 행동 | 근거 |",
        "|---|---|",
    ]
    for d in dep["actions"]:
        out.append("| `%s` | %s |" % (d["action"], d["basis"]))

    out += [
        "",
        "## 행동이 없어 큐만 정의해 둔 것",
        "",
        "| 제안 행동 ID | 큐 | 근거 |",
        "|---|---|---|",
    ]
    for p in S["proposedActions"]["items"]:
        out.append("| `%s` | `%s` | %s |" % (p["proposedId"], p["cue"], p["basis"]))

    (HERE / "SFX-CUESHEET.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    print("SFX-CUESHEET.md written: %d cues" % len(S["sfx"]))


if __name__ == "__main__":
    main()

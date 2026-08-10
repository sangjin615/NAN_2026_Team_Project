#!/usr/bin/env python3
"""Remove superseded V5 mechanics from human-readable VSL handoff specs."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ROOT / "spec" / "failure-cases.md",
    ROOT / "spec" / "test-cases.md",
    ROOT / "spec" / "scene-index.md",
    ROOT / "spec" / "scene-ui-requirements.md",
]

REPLACEMENTS = (
    ("시장 예보", "수요 동향"),
    ("출품 순서", "출품 목록"),
    ("BUY_LOT_ORDER", "BUY_LOT_CATALOG"),
    ("act-buy-lot-order", "act-buy-lot-catalog"),
    ("세트 계약", "족보 판매"),
    ("ACCEPT_SET_CONTRACT", "FORM_HANBO"),
    ("act-accept-set-contract", "act-form-hanbo"),
    ("popup-contract-result", "popup-hanbo-result"),
    ("3일 만기", "2일 만기"),
    ("대출 한도 70%·이자 10%·2일 만기", "처분가 45%·상환 x1.90·2일 만기"),
)


def drop_heading_section(text: str, heading_fragment: str) -> str:
    pattern = re.compile(
        rf"^##[^\n]*{re.escape(heading_fragment)}[^\n]*\n.*?(?=^##\s|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    return pattern.sub("", text)


def clean(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    for heading in ("유물 정보 구매",):
        text = drop_heading_section(text, heading)
    for before, after in REPLACEMENTS:
        text = text.replace(before, after)

    lines = []
    for line in text.splitlines():
        if any(token in line for token in ("BUY_RELIC_CLUE", "act-buy-relic-clue", "act-fulfill-set-contract")):
            continue
        if "유물 정보" in line and not any(token in line for token in ("판매하지", "사용하지", "삭제")):
            continue
        if "족보 판매 수락" in line:
            line = line.replace("족보 판매 수락", "족보 판매 실행")
        lines.append(line.rstrip())
    text = "\n".join(lines).strip() + "\n"
    path.write_text(text, encoding="utf-8")


for target in FILES:
    if target.exists():
        clean(target)


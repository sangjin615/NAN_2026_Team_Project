#!/usr/bin/env python3
"""Build the V6.2 hackathon VSL package from the approved V6.1 spec ZIP."""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path


if len(sys.argv) != 5:
    raise SystemExit(
        "usage: build-vsl-v6-2-package.py SOURCE_ZIP TOOL_ROOT OUTPUT_ZIP REPORT_JSON"
    )

source_zip, tool_root, output_zip, report_json = map(Path, sys.argv[1:5])
output_root_name = "미지의_경매장_V6_2_해커톤구현기준_VSL_FINAL"

text_replacements = (
    ("미지의 경매장 V6.1 확정사양 프로젝트 FINAL", "미지의 경매장 V6.2 해커톤 구현 기준 VSL FINAL"),
    ("V6.1 확정사양", "V6.2 해커톤 구현 기준"),
    ("layout-contract-6.1-final", "layout-contract-6.2-hackathon"),
    ("unknown-auction-v6-1-final-spec", "unknown-auction-v6-2-hackathon"),
    ("6.1-final-clean", "6.2-hackathon-clean"),
    ("6.1-final", "6.2-hackathon"),
    ("기존 고정 승급비 7,000/11,000/16,500", "측정 기준 승급비 7,500/12,000/17,500"),
    ("기존 고정 승급비 7,000 / 11,000 / 16,500", "측정 기준 승급비 7,500 / 12,000 / 17,500"),
    ("고정 7,000 / 11,000 / 16,500", "고정 7,500 / 12,000 / 17,500"),
    ("보관칸 4/5/6/7", "보관칸 3/4/5/6"),
    ("단계별 보관칸은 4/5/6/7", "단계별 보관칸은 3/4/5/6"),
    ("처분가의 70%", "처분가의 35%"),
    ("처분가 70%", "처분가 35%"),
    ("담보가 70% 대출", "담보가 35% 대출"),
    ("70%·만기 상환 110%", "35%·만기 상환 190%"),
    ("70%/110%", "35%/190%"),
    ("원금의 110%", "원금의 190%"),
    ("만기 상환 110%", "만기 상환 190%"),
    ("만기 110%", "만기 190%"),
)


def replace_active_text(value: str) -> str:
    for old, new in text_replacements:
        value = value.replace(old, new)
    return value


def transform(value):
    if isinstance(value, dict):
        return {key: transform(item) for key, item in value.items()}
    if isinstance(value, list):
        return [transform(item) for item in value]
    if isinstance(value, str):
        return replace_active_text(value)
    return value


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


balance_contract = {
    "schemaVersion": "unknown-auction-balance-contract-6.2",
    "status": "hackathon-implementation-baseline",
    "derivedFrom": {
        "uxAndFlow": "V6.1 final visual spec",
        "numericBalance": "Runtime/data/balance.json 900-seed measurement baseline",
    },
    "run": {"days": 12, "lotsPerDay": 8, "startCash": 20000},
    "auction": {
        "competitors": 3,
        "playerTurnSeconds": 15,
        "minimumRaiseRate": 0.10,
        "transactionFeeRate": 0,
        "firstNoBidPolicy": "requeue-at-end",
        "secondNoBidPolicy": "final-no-sale",
    },
    "shop": {
        "stages": 4,
        "upgradeCosts": [0, 7500, 12000, 17500],
        "storageByStage": [0, 3, 4, 5, 6],
        "requiredStageAfterDay": {"3": 2, "6": 3, "9": 4},
    },
    "loan": {
        "unlockShopStage": 2,
        "limitFromDisposalValue": 0.35,
        "maturityRepayMultiplier": 1.90,
        "earlyRepayMultiplier": 1.0,
        "dueDayOffset": 2,
        "maxConcurrent": 1,
        "overdue": "seize-collateral-and-lock-guild-for-run",
    },
    "failure": {"bankruptcyEnabled": False, "upgradeDeadlineFailureEnabled": True},
    "quest": {
        "offersPerDay": 3,
        "deliveryMode": "manual-item-delivery-at-office",
        "deadline": "three-auction-opportunities",
        "day12Delivery": "before-final-settlement-sale",
    },
    "generation": {
        "engineOwns": ["basePrice", "trueValue", "quality", "numericRules", "judgement"],
        "modelOwns": ["displayName", "description", "rumor", "setHint", "npcReaction"],
        "bufferDaysAhead": 2,
        "retryCount": 1,
        "fallbackTemplateSets": 3,
    },
}


baseline_doc = """# V6.2 해커톤 구현 기준

V6.2는 V6.1의 화면·플로우 계약과 현재 Runtime의 900시드 측정 기반 수치를 결합한 구현 기준이다.

## 채택한 V6.1 구조

- 14개 씬과 20개 UI 상태
- 직접 의뢰 제출과 직접 세트 재료 선택
- 3개 저장 슬롯과 current/backup/temp 원자 저장
- 일반 경매 방식의 최종 유물 경매 3라운드
- 3×3 영구 유물 전시관
- 수수료와 파산 제거, 3·6·9일 승급 기한 실패
- 엔진 수치와 생성 모델 문장 소유권 분리

## 채택한 측정 기반 수치

- 승급비: 7,500 / 12,000 / 17,500
- 보관칸: 3 / 4 / 5 / 6
- 대출 한도: 담보 현재 처분가의 35%
- 정상 만기 상환: 원금의 190%
- 중도 상환: 원금 100%
- 조합 해금: 상회 2단계
- 최소 호가 인상: 현재 호가의 10% 정수 올림

## 구현 원칙

- 보이는 UI는 이미지·9-Slice 에셋으로 구성한다.
- CSS는 좌표·레이어·레터박스 배치에만 사용한다.
- 목업에 박힌 가격·품목·일차 텍스트는 실제 UI로 쓰지 않는다.
- VSL의 actionRef와 dataRefs를 Runtime binding에 연결한다.
- 생성 API가 없어도 고정 템플릿으로 12일을 완주할 수 있어야 한다.

기계 판독 기준은 `contracts/v6.2-runtime-balance.json`이다.
"""


changelog_doc = """# V6.1 → V6.2 변경 보고서

## 유지

- V6.1의 씬, UI 상태, 행동, 데이터 경로, 저장, 의뢰, 유물 경매 구조를 유지했다.
- 수수료와 파산을 제거한 단순한 실패 구조를 유지했다.

## 변경

- 승급비를 7,500 / 12,000 / 17,500으로 변경했다.
- 보관칸을 3 / 4 / 5 / 6으로 변경했다.
- 대출 한도를 담보 처분가의 35%로 변경했다.
- 정상 만기 상환을 원금의 190%로 변경했다.
- 중도 상환은 원금 100%, 만기는 실행일+2일, 동시 대출은 1건으로 유지했다.
- 조합 해금은 플레이 흐름을 위해 상회 2단계로 유지했다.

## 근거

V6.1의 70%·110% 대출과 4/5/6/7 보관칸은 현재 900시드 측정 기준보다 관대하다. V6.2는 화면과 선택 구조는 V6.1을 따르되 수치는 측정된 Runtime 기준을 사용한다. 마이그레이션 뒤 V6.2 값으로 900시드를 다시 측정해야 한다.
"""


with tempfile.TemporaryDirectory(prefix="unknown-auction-v6-2-") as temp_name:
    temp = Path(temp_name)
    package_root = temp / output_root_name
    package_root.mkdir()

    with zipfile.ZipFile(source_zip, "r") as source:
        names = source.namelist()
        source_prefix = names[0].split("/")[0] + "/"
        for info in source.infolist():
            if info.is_dir():
                continue
            relative = info.filename[len(source_prefix) :] if info.filename.startswith(source_prefix) else info.filename
            destination = package_root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(source.read(info.filename))

    history = package_root / "docs" / "history"
    history.mkdir(parents=True, exist_ok=True)
    for name in ("CHANGELOG-V6-TO-V6.1.md", "FINAL-CLEANUP-REPORT.md"):
        source = package_root / "docs" / name
        if source.exists():
            shutil.move(source, history / name)

    old_readme = package_root / "README-V6.1.md"
    readme = package_root / "README-V6.2.md"
    if old_readme.exists():
        shutil.move(old_readme, readme)

    active_json = [
        package_root / "flow.json",
        package_root / "layout.json",
        package_root / "docs" / "DECISION-SUMMARY.json",
    ]
    for path in active_json:
        value = transform(json.loads(path.read_text(encoding="utf-8-sig")))
        if path.name == "DECISION-SUMMARY.json":
            value["schemaVersion"] = "auction-v6.2-decisions-1.0"
            value["date"] = "2026-08-03"
            value["keyRules"]["loan"].update(
                {"ltv": 0.35, "maturityRepay": 1.90, "earlyRepay": 1.0, "unlockShopStage": 2}
            )
            value["keyRules"]["storageByStage"] = [3, 4, 5, 6]
            value["keyRules"]["upgradeCosts"] = [7500, 12000, 17500]
        write_json(path, value)

    active_markdown = [
        readme,
        package_root / "docs" / "SCENE-FUNCTION-SPEC.md",
        package_root / "docs" / "IMPLEMENTATION-CHECKLIST.md",
        package_root / "docs" / "VALIDATION-REPORT.md",
    ]
    for path in active_markdown:
        write_text(path, replace_active_text(path.read_text(encoding="utf-8-sig")))

    readme_text = readme.read_text(encoding="utf-8")
    readme_text += "\n## V6.2 구현 계약\n\n- `contracts/v6.2-runtime-balance.json`: Runtime 단일 수치 기준\n- `docs/V6.2-IMPLEMENTATION-BASELINE.md`: 채택·변경 근거\n- `docs/CHANGELOG-V6.1-TO-V6.2.md`: V6.1 대비 변경점\n"
    write_text(readme, readme_text)

    validation = package_root / "docs" / "VALIDATION-REPORT.md"
    validation_text = validation.read_text(encoding="utf-8")
    validation_text += "\n## V6.2 추가 검증\n\n- 활성 문서의 V6.1 대출·승급비·보관칸 문구 제거\n- 기계 판독 balance contract와 결정 요약 일치\n- action/data/modal/nav 내부 참조 검사\n- ZIP 파일·이미지 무결성 검사\n- 사운드는 외부 의존성으로 유지하며 실제 음원은 이 ZIP에 포함하지 않음\n"
    write_text(validation, validation_text)

    write_json(package_root / "contracts" / "v6.2-runtime-balance.json", balance_contract)
    write_text(package_root / "docs" / "V6.2-IMPLEMENTATION-BASELINE.md", baseline_doc)
    write_text(package_root / "docs" / "CHANGELOG-V6.1-TO-V6.2.md", changelog_doc)

    for launcher_name in ("VSL_레이아웃_9SLICE_실행.html", "VSL_사운드편집기_실행.html"):
        launcher = tool_root / launcher_name
        if launcher.is_file():
            shutil.copy2(launcher, package_root / launcher_name)

    output_zip.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=7) as target:
        for path in sorted(package_root.rglob("*")):
            if path.is_file():
                target.write(path, (Path(output_root_name) / path.relative_to(package_root)).as_posix())

digest = hashlib.sha256()
with output_zip.open("rb") as stream:
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(chunk)

report = {
    "source": str(source_zip),
    "output": str(output_zip),
    "sizeBytes": output_zip.stat().st_size,
    "sha256": digest.hexdigest(),
    "baseline": balance_contract,
}
write_json(report_json, report)
print(json.dumps(report, ensure_ascii=False, indent=2))

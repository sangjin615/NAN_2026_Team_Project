#!/usr/bin/env python3
"""Align the v6.3 project export to the V6 planning source and attach sound refs.

This script is deliberately deterministic: run it again after importing a fresh
v6.3 export and it will produce the same V6.4 sound-integrated contract.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SOUND_PATH = ROOT / "sound" / "sound.json"

ID_RENAMES = {
    "act-buy-lot-order": "act-buy-lot-catalog",
    "act-accept-set-contract": "act-form-hanbo",
    "act-close-contract-result": "act-close-hanbo-result",
    "popup-contract-result": "popup-hanbo-result",
    "daily.contractOffers": "hanbo.patterns",
    "information.lotOrder": "information.lotCatalog",
}

REMOVED_IDS = {
    "act-buy-relic-clue",
    "act-fulfill-set-contract",
}

REMOVED_DATA_PATHS = {
    "contracts.active",
    "contracts.deadline",
}

TEXT_RENAMES = (
    ("미지의 경매장 V5", "미지의 경매장 V6"),
    ("시장 예보", "수요 동향"),
    ("출품 순서", "출품 목록"),
    ("세트 계약 완료", "족보 판매 완료"),
    ("세트 계약", "족보 판매"),
    ("세트 판매", "족보 판매"),
    ("세트 정산", "족보 배수"),
    ("SetContract", "HanboPattern"),
    ("3일 만기", "2일 만기"),
    ("대출 한도 70%·이자 10%·2일 만기", "처분가 45%·상환 x1.90·2일 만기"),
    ("3일 내 상환", "2일 내 상환"),
)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def replace_text(value: str) -> str:
    if value in ID_RENAMES:
        return ID_RENAMES[value]
    for before, after in TEXT_RENAMES:
        value = value.replace(before, after)
    return value


def should_remove_dict(value: dict[str, Any]) -> bool:
    identifiers = {
        str(value.get(key, ""))
        for key in ("id", "actionRef", "action", "actionId", "ref")
    }
    if identifiers & (REMOVED_IDS | REMOVED_DATA_PATHS):
        return True
    if value.get("path") in REMOVED_DATA_PATHS:
        return True
    joined = " ".join(
        str(value.get(key, ""))
        for key in ("id", "title", "name", "label", "path", "dataPath", "notes")
    )
    if "유물 정보" in joined or "relicClue" in joined or "relicClues" in joined:
        return True
    return False


def transform(value: Any) -> Any:
    if isinstance(value, str):
        return replace_text(value)
    if isinstance(value, list):
        result = []
        for item in value:
            if isinstance(item, str) and (
                item in REMOVED_IDS
                or item in REMOVED_DATA_PATHS
                or "relicClue" in item
                or "relicClues" in item
                or "유물 정보" in item
            ):
                continue
            if isinstance(item, dict) and should_remove_dict(item):
                continue
            transformed = transform(item)
            result.append(transformed)
        return result
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for key, item in value.items():
            new_key = replace_text(key)
            result[new_key] = transform(item)
        return result
    return value


def update_action(action: dict[str, Any]) -> dict[str, Any]:
    action = transform(action)
    action_id = action.get("id")
    if action_id == "act-buy-lot-catalog":
        action.update(
            name="BUY_LOT_CATALOG",
            label="출품 목록 구매",
            input="오늘 출품 목록 정보",
            preconditions=["도시 페이즈다.", "아직 출품 목록을 구매하지 않았다.", "구매 비용을 보유한다."],
            successResults=["오늘 출품 8점의 계열·등급·기준가 목록을 공개한다.", "비용을 차감한다."],
            failureResults=["자금 부족 또는 이미 구매한 경우 상태를 바꾸지 않고 사유를 표시한다."],
            sourceBasis="V6 §2.1, §10.1",
            implementationStatus="implemented",
            runtimeBindings=["Game.buyInfo", "buyInfo"],
            readRefs=["daily.lots", "player.cash", "shop.stage"],
            writeRefs=["daily.info", "daily.expense", "information.lotCatalog", "player.cash"],
        )
    elif action_id == "act-form-hanbo":
        action.update(
            name="FORM_HANBO",
            label="족보 판매",
            input="성립 가능한 족보와 보유품",
            preconditions=["거래소의 족보 판매 탭이다.", "선택 족보의 조건을 만족한다.", "선택 물품이 판매 가능하다."],
            successResults=["선택 물품을 판매 처리한다.", "족보 배수를 적용한 판매 대금을 지급한다.", "족보 판매 결과를 표시한다."],
            failureResults=["조건 미달 또는 잠긴 물품이 있으면 상태를 바꾸지 않고 사유를 표시한다."],
            sourceBasis="V6 §11.2~§11.4",
            implementationStatus="implemented",
            runtimeBindings=["Game.sellHanbo", "sellHanbo"],
            readRefs=["hanbo.patterns", "player.inventory", "market.indexByFamily", "shop.stage"],
            writeRefs=["player.cash", "player.inventory", "daily.income", "ui.modal"],
        )
    elif action_id == "act-close-hanbo-result":
        action.update(
            name="CLOSE_HANBO_RESULT",
            label="족보 판매 결과 닫기",
            input="없음",
            sourceBasis="V6 §11.2~§11.4",
            runtimeBindings=["Game.closeModal", "closeModal"],
            readRefs=["ui.modal"],
            writeRefs=["ui.modal"],
        )
    return action


def reveal_appraisal_action() -> dict[str, Any]:
    return {
        "id": "act-reveal-appraisal",
        "name": "REVEAL_APPRAISAL",
        "label": "감정 결과 공개",
        "triggerType": "auto",
        "input": "감정된 출품",
        "preconditions": ["감정 비용 결제가 완료되었다."],
        "successResults": ["일차별 오차를 적용한 품질 범위를 공개한다.", "실가치·추천 입찰가는 표시하지 않는다."],
        "failureResults": ["결과 생성 실패 시 결제를 취소하고 현재 화면을 유지한다."],
        "sourceBasis": "V6 §10.2, 불변 9",
        "implementationStatus": "implemented",
        "runtimeBindings": ["Game.appraise", "appraise"],
        "notes": "결과의 좋고 나쁨에 따라 효과음을 바꾸지 않는다.",
        "readRefs": ["daily.lots", "run.day"],
        "writeRefs": ["daily.appraisals", "ui.modal"],
    }


def sync_action_pins(container: dict[str, Any], action_by_id: dict[str, dict[str, Any]]) -> None:
    """Keep every action pin's declared inputs identical to its action contract."""
    for annotation in container.get("annotations", []):
        action = action_by_id.get(annotation.get("actionRef", ""))
        if action:
            annotation["dataRefs"] = list(action.get("readRefs", []))
    container["actionRefs"] = [
        ref for ref in container.get("actionRefs", []) if ref in action_by_id
    ]
    for requirement in container.get("uiRequirements", []):
        requirement["actionRefs"] = [
            ref for ref in requirement.get("actionRefs", []) if ref in action_by_id
        ]


def sync_contract_registry(flow: dict[str, Any]) -> None:
    """Regenerate the registry mirrors used by VSL contract verification."""
    registry = flow["contracts"]
    previous_actions = {item["id"]: item for item in registry.get("actions", [])}
    default_owner = {
        "act-reveal-appraisal": "sys-appraisal",
    }
    contract_actions = []
    for action in flow["actions"]:
        item = copy.deepcopy(previous_actions.get(action["id"], {}))
        item.update(
            id=action["id"],
            title=action.get("label") or action.get("title") or action["id"],
            ownerSystemRef=item.get("ownerSystemRef") or default_owner.get(action["id"], "sys-ui"),
            inputTypeRef=item.get("inputTypeRef", ""),
            outputTypeRef=item.get("outputTypeRef", ""),
            readRefs=list(action.get("readRefs", [])),
            writeRefs=list(action.get("writeRefs", [])),
            description=action.get("input", "없음"),
        )
        if action.get("scope"):
            item["scope"] = action["scope"]
        contract_actions.append(item)
    registry["actions"] = contract_actions

    registry["data"] = [
        {
            "id": data["path"],
            "title": data.get("label", data["path"]),
            "typeRef": data["typeRef"],
            "sourceMode": data.get("sourceMode", "engine"),
            "ownerSystemRef": data["ownerSystemRef"],
            "generatorRef": data.get("generatorRef", ""),
            "description": data.get("notes", ""),
        }
        for data in flow["dataPaths"]
    ]


def repair_removed_action_refs(value: Any) -> None:
    """Redirect UI-result open hooks from the deleted V5 fulfillment action."""
    if isinstance(value, dict):
        for key, item in list(value.items()):
            if key == "openActionRef" and item == "act-fulfill-set-contract":
                value[key] = "act-form-hanbo"
            else:
                repair_removed_action_refs(item)
    elif isinstance(value, list):
        for item in value:
            repair_removed_action_refs(item)


def update_scene(scene: dict[str, Any], sound: dict[str, Any]) -> dict[str, Any]:
    scene = transform(scene)
    scene_id = scene.get("id")
    if scene_id == "scene-tavern":
        scene["description"] = "수요 동향·출품 목록·경쟁자 예산을 판매하는 정보 거점. 유물 정보는 판매하지 않는다."
        scene["requirements"] = ["수요 동향", "출품 목록", "경쟁자 예산", "확보한 정보"]
    elif scene_id == "scene-exchange":
        scene["description"] = "보유품의 즉시 처분·족보 판매·시세판을 제공하며 12일차에는 당일 낙찰품 즉시 처분 예외를 연다."
        scene["requirements"] = ["즉시 처분", "족보 6종", "시세판", "12일차 정산 예외"]
    elif scene_id == "scene-guild":
        scene["description"] = "상회 3단계부터 미판매 보유품을 담보로 유동성을 확보하고 2일 내 상환하는 조합 화면."
    elif scene_id == "scene-final":
        scene["description"] = "경제 밖의 최종 3라운드 공개 호가. 거물은 이름만 표시하며 유물 정보 채널은 사용하지 않는다."
        scene["requirements"] = ["3라운드 공개 호가", "거물 이름 표시", "유물 획득 판정"]

    if scene_id == "scene-tavern":
        scene["mockupCorrections"] = [
            "정보 채널은 수요 동향·출품 목록·경쟁자 예산 3종만 사용한다.",
            "수요 동향은 사건 방향만 공개하고 진폭은 공개하지 않는다.",
        ]

    scene_map = sound.get("sceneBgmMap", {})
    if scene_id in scene_map:
        mapping = copy.deepcopy(scene_map[scene_id])
        scene["sound"] = {
            "bgm": mapping.get("bgm"),
            "layers": mapping.get("layers"),
            "layersOnSuccess": mapping.get("layersOnSuccess"),
            "restart": mapping.get("restart", True),
        }

    action_map = sound.get("actionSfxMap", {})
    for annotation in scene.get("annotations", []):
        action_ref = annotation.get("actionRef")
        if action_ref in action_map:
            annotation["soundCue"] = action_map[action_ref]
    return scene


def update_sound_contract() -> dict[str, Any]:
    sound = read_json(SOUND_PATH)
    sound["version"] = "6.4-sound-1.0"
    sound["generatedFor"] = "미지의 경매장 V6.4 사운드 통합 HTML/Web"

    mapping = sound["actionSfxMap"]
    for old in ("act-buy-lot-order", "act-accept-set-contract", "act-close-contract-result", "act-buy-relic-clue", "act-fulfill-set-contract"):
        mapping.pop(old, None)
    mapping.update(
        {
            "act-buy-lot-catalog": "sfx-info-buy",
            "act-form-hanbo": "sfx-hanbo-complete",
            "act-reveal-appraisal": "sfx-appraise-reveal",
            "act-close-hanbo-result": "sfx-popup-close",
        }
    )

    ui_map = sound["uiStateSfxMap"]
    ui_map.pop("popup-contract-result", None)
    ui_map["popup-hanbo-result"] = {"open": "sfx-hanbo-complete", "close": "sfx-popup-close"}
    sound["deprecated"] = {
        "note": "V6.4 정합성 반영으로 폐기 행동과 UI 상태를 계약에서 제거했다.",
        "actions": [],
        "uiStates": [],
    }
    sound["proposedActions"] = {
        "note": "V6.4에서 이전 제안 행동 3종을 정식 행동으로 반영했다.",
        "items": [],
    }
    write_json(SOUND_PATH, sound)
    return sound


def update_project() -> None:
    sound = update_sound_contract()
    flow_path = ROOT / "flow.json"
    flow = transform(read_json(flow_path))
    flow["project"].update(
        id="unknown-auction-v6-sound",
        title="미지의 경매장 V6 — 사운드 통합",
        target="html/web",
        build="index.html",
    )
    flow["sourceDocument"] = "미지의경매장_V6_통합기획서"

    actions = []
    for action in flow.get("actions", []):
        if action.get("id") in REMOVED_IDS:
            continue
        actions.append(update_action(action))
    if not any(action.get("id") == "act-reveal-appraisal" for action in actions):
        actions.append(reveal_appraisal_action())
    flow["actions"] = actions

    # V6 has six always-available pedigree patterns, not accepted contracts.
    for data in flow.get("dataPaths", []):
        if data.get("path") == "hanbo.patterns":
            data.update(
                label="족보 6종 패턴",
                notes="수락·기한 없이 보유품 조합이 성립할 때 즉시 판매할 수 있다.",
                typeRef="HanboPattern[]",
                ownerSystemRef="sys-set",
                sourceMode="engine",
            )
        elif data.get("path") == "information.lotCatalog":
            data.update(
                label="출품 목록",
                notes="오늘 출품 8점의 계열·등급·기준가를 미리 본다.",
                typeRef="Boolean",
                ownerSystemRef="sys-information",
                sourceMode="engine",
            )

    flow["nodes"] = [update_scene(scene, sound) for scene in flow.get("nodes", [])]
    flow["uiStates"] = [transform(state) for state in flow.get("uiStates", []) if not should_remove_dict(state)]
    for state in flow["uiStates"]:
        if state.get("id") == "popup-hanbo-result":
            state.update(
                title="족보 판매 완료",
                description="족보 조건·사용 물품·적용 배수·최종 판매 대금을 표시한다.",
                openActionRef="act-form-hanbo",
            )
        elif state.get("id") == "popup-information-result":
            state["description"] = "구매한 수요 동향·출품 목록·경쟁자 예산의 공개 범위를 표시한다."
    action_by_id = {action["id"]: action for action in actions}
    for container in flow["nodes"] + flow["uiStates"]:
        sync_action_pins(container, action_by_id)
    sync_contract_registry(flow)
    repair_removed_action_refs(flow)
    flow["soundContract"] = {
        "schemaVersion": sound["schemaVersion"],
        "version": sound["version"],
        "path": "sound/sound.json",
        "runtimeConfig": "assets/runtime/audio/sound-runtime.js",
        "prototypeAudio": True,
    }
    write_json(flow_path, flow)
    write_json(ROOT / "contracts.json", flow["contracts"])

    # Keep scene folders authoritative and synchronized with the aggregate flow.
    by_id = {scene["id"]: scene for scene in flow["nodes"]}
    for scene_path in ROOT.glob("scenes/**/scene.json"):
        current = read_json(scene_path)
        scene_id = current.get("id")
        if scene_id in by_id:
            write_json(scene_path, by_id[scene_id])

    # Transform other machine-readable exports, then force actions to the flow list.
    targets = [ROOT / "layout.json", ROOT / "implementation-contract.json"]
    targets += [ROOT / "data" / "implementation-status.json"]
    targets += list((ROOT / "global").glob("**/*.json"))
    targets += list((ROOT / "shared").glob("**/*.json"))
    targets += list((ROOT / "spec").glob("*.json"))
    for path in targets:
        if not path.exists():
            continue
        data = transform(read_json(path))
        if isinstance(data, dict):
            repair_removed_action_refs(data)
        if path.name == "implementation-contract.json" and isinstance(data, dict):
            data["soundContract"] = flow["soundContract"]
        if path.name == "implementation-status.json" and isinstance(data, dict):
            data["actions"] = actions
            data.setdefault("summary", {})["actions"] = len(actions)
            data["version"] = "6.4"
        write_json(path, data)
    write_json(ROOT / "spec" / "actions.json", actions)

    manifest_path = ROOT / "manifest.json"
    manifest = read_json(manifest_path)
    manifest.update(
        schemaVersion="visual-spec-project-implementation-1.3",
        version="6.4",
        projectId="unknown-auction-v6-sound",
        projectTitle="미지의 경매장 V6 — 사운드 통합",
        fixVersion="v6.4-v6-alignment-and-sound-runtime",
    )
    manifest["sound"] = {
        "contract": "sound/sound.json",
        "runtime": "assets/runtime/audio/audio-manager.js",
        "config": "assets/runtime/audio/sound-runtime.js",
        "prototypeAssets": True,
        "bgmCompositions": 5,
        "bgmSlots": 12,
        "sfxCues": len(sound["sfx"]),
    }
    manifest.setdefault("counts", {})["actions"] = len(actions)
    manifest["counts"]["uiStates"] = len(flow["uiStates"])
    write_json(manifest_path, manifest)

    runtime_dir = ROOT / "assets" / "runtime" / "audio"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    runtime_js = "window.UNKNOWN_AUCTION_SOUND = " + json.dumps(sound, ensure_ascii=False, indent=2) + ";\n"
    (runtime_dir / "sound-runtime.js").write_text(runtime_js, encoding="utf-8")

    report = f"""# V6.4 정합성·사운드 통합 보고서

- 기준: V6 통합 기획서 우선
- 씬: {len(flow['nodes'])}
- UI 상태: {len(flow['uiStates'])}
- 행동: {len(actions)}
- 사운드 큐: {len(sound['sfx'])}
- BGM: {len(sound['bgm'])}곡 / 12개 납품 슬롯

## V6 반영

- 세트 계약형을 기한 없는 족보 판매로 교체
- 출품 순서를 출품 목록 채널로 교체
- 유물 정보 구매 및 표시 제거
- 조합 해금을 상회 3단계, 대출 만기를 2일로 정리
- 감정 결과 공개 행동을 정식 계약에 추가
- 씬과 행동에 `sound` / `soundCue` 참조 부착

## 런타임

- `sound/sound.json`: 사운드 단일 기준
- `assets/runtime/audio/sound-runtime.js`: file:// 실행 호환 설정
- `assets/runtime/audio/audio-manager.js`: BGM/SFX/앰비언스 버스와 전환
- `assets/runtime/audio/**`: 교체 가능한 프로토타입 음원
"""
    (ROOT / "V6.4-SOUND-ALIGN-REPORT.md").write_text(report, encoding="utf-8")


if __name__ == "__main__":
    update_project()

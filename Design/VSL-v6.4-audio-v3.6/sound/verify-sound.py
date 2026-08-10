#!/usr/bin/env python3
"""sound.json <-> flow.json 정합성 검사.

v6.3 팩의 verify-contracts.py와 같은 역할을 사운드 층에서 한다.
사운드를 고친 뒤, 그리고 flow.json이 갱신될 때마다 돌린다.

    python verify-sound.py                    (flow.json을 상위 폴더에서 찾는다)
    python verify-sound.py --flow <경로>
    python verify-sound.py --check-files      실제 오디오 파일 존재까지 확인

종료 코드 0 = 오류 없음.
"""
import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--flow", default="../flow.json")
    p.add_argument("--check-files", action="store_true")
    p.add_argument("--audio-root", default="../assets/runtime/audio")
    args = p.parse_args()

    sound = json.loads((HERE / "sound.json").read_text(encoding="utf-8"))

    flow_path = (HERE / args.flow).resolve()
    if not flow_path.exists():
        sys.exit("flow.json을 찾을 수 없습니다: %s\n--flow 로 경로를 지정하세요." % flow_path)
    flow = json.loads(flow_path.read_text(encoding="utf-8"))

    errors, warnings = [], []

    actions = {a["id"] for a in flow["actions"]}
    scenes = {n["id"] for n in flow["nodes"]}
    ui_states = {u["id"] for u in flow["uiStates"]}
    cues = {c["id"] for c in sound["sfx"]}
    bgms = {b["id"] for b in sound["bgm"]}
    deprecated = {d["action"] for d in sound["deprecated"]["actions"]}
    mapped = set(sound["actionSfxMap"])

    # 1. 행동 커버리지
    for a in sorted(actions - mapped - deprecated):
        errors.append("행동에 사운드 매핑이 없음: %s" % a)
    for a in sorted(mapped - actions):
        errors.append("flow.json에 없는 행동을 매핑함: %s" % a)
    for a in sorted(mapped & deprecated):
        errors.append("폐기 행동에 큐를 붙임: %s" % a)

    # 2. 큐 참조 무결성
    for a, c in sound["actionSfxMap"].items():
        if c and c not in cues:
            errors.append("존재하지 않는 큐 참조: %s -> %s" % (a, c))
    for uid, m in sound["uiStateSfxMap"].items():
        if not isinstance(m, dict):
            continue
        for k in ("open", "close"):
            c = m.get(k)
            if c and c not in cues:
                errors.append("존재하지 않는 큐 참조: %s.%s -> %s" % (uid, k, c))

    # 3. 씬 / UI 상태 커버리지
    for s in sorted(scenes - set(sound["sceneBgmMap"])):
        errors.append("씬에 BGM 매핑이 없음: %s" % s)
    for s in sorted(set(sound["sceneBgmMap"]) - scenes):
        errors.append("flow.json에 없는 씬을 매핑함: %s" % s)
    dep_ui = {d["uiState"] for d in sound["deprecated"].get("uiStates", [])}
    for u in sorted(ui_states - set(sound["uiStateSfxMap"]) - dep_ui):
        warnings.append("UI 상태에 큐 매핑이 없음: %s" % u)

    # 4. BGM 참조 및 레이어
    for sid, m in sound["sceneBgmMap"].items():
        candidates = [("기본", m)] + [("변주", item) for item in m.get("variants", [])]
        for label, candidate in candidates:
            if candidate["bgm"] not in bgms:
                errors.append("존재하지 않는 BGM 참조: %s %s -> %s" % (sid, label, candidate["bgm"]))
                continue
            bgm = next(b for b in sound["bgm"] if b["id"] == candidate["bgm"])
            available = {l["id"] for l in (bgm.get("layers") or [])}
            for key in ("layers", "layersOnSuccess"):
                for layer in candidate.get(key) or []:
                    if layer not in available:
                        errors.append(
                            "%s %s: %s에 없는 레이어 %s" % (sid, label, candidate["bgm"], layer)
                        )

    # 5. 프롬프트 존재
    for c in sound["sfx"]:
        if not c.get("prompt"):
            warnings.append("생성 프롬프트 없음: %s (inject-prompts.py 실행)" % c["id"])

    # 6. 믹스 규칙 참조
    for rule in sound["mixRules"]["ducking"]:
        if rule["trigger"] not in cues:
            errors.append("덕킹 트리거가 존재하지 않는 큐: %s" % rule["trigger"])
    for cid in sound["mixRules"]["polyphony"]["overrides"]:
        if cid not in cues:
            errors.append("동시발음 설정이 존재하지 않는 큐: %s" % cid)

    # 7. 강조 큐가 금지 규칙과 충돌하지 않는지
    melody_allowed = {"sfx-hanbo-complete", "sfx-upgrade", "sfx-relic-acquire"}
    for c in sound["sfx"]:
        if c.get("accent") and c["gain"] < -14:
            warnings.append("강조 큐인데 게인이 낮음: %s (%ddB)" % (c["id"], c["gain"]))
    missing_melody = melody_allowed - cues
    if missing_melody:
        errors.append("멜로디 예외 큐가 정의되지 않음: %s" % ", ".join(sorted(missing_melody)))

    # 8. 파일 존재 (선택)
    if args.check_files:
        root = (HERE / args.audio_root).resolve()
        for c in sound["sfx"]:
            sub = "ambience" if c.get("loop") else "sfx"
            ext = ".ogg" if c.get("loop") else ".wav"
            candidates = [root / sub / (c["id"] + ext)]
            if c.get("loop"):
                candidates.append(root / sub / (c["id"] + ".wav"))
            if not any(path.exists() for path in candidates):
                warnings.append("오디오 파일 없음: %s/%s%s" % (sub, c["id"], ext))
        for b in sound["bgm"]:
            names = []
            if b["structure"].get("intro"):
                names.append("%s__intro.ogg" % b["id"])
            if b.get("layers"):
                names += ["%s__%s.ogg" % (b["id"], l["id"]) for l in b["layers"]]
            else:
                names.append("%s__loop.ogg" % b["id"])
            for n in names:
                candidates = [root / "bgm" / n, root / "bgm" / n.replace(".ogg", ".wav")]
                if not any(path.exists() for path in candidates):
                    warnings.append("오디오 파일 없음: bgm/%s" % n)

    # 결과
    print("검사 대상: 행동 %d · 씬 %d · UI상태 %d · 큐 %d · BGM %d"
          % (len(actions), len(scenes), len(ui_states), len(cues), len(bgms)))
    print("행동 커버리지: %d/%d (폐기 %d건 제외)"
          % (len(mapped), len(actions) - len(deprecated), len(deprecated)))
    print("")
    for w in warnings:
        print("  [주의] %s" % w)
    for e in errors:
        print("  [오류] %s" % e)
    print("")
    print("오류 %d건 · 주의 %d건" % (len(errors), len(warnings)))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

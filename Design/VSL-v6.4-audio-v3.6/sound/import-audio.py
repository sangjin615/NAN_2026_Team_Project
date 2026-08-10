#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""로컬 오디오 폴더를 스캔해 큐에 자동 배정한다.

VSL 없이 명령줄만으로도 배정할 수 있다. 세 가지 방식을 순서대로 시도한다.
  1. 정확 일치 — 파일명(확장자 제외)이 큐 ID와 같다
  2. 키워드 매칭 — 파일명에 큐의 검색 키워드가 들어 있다 (신뢰도와 함께 제안만)
  3. 수동 매핑 — mapping.txt (한 줄에 "큐ID = 파일명")

사용:
    python import-audio.py <오디오폴더>                 스캔하고 결과만 출력
    python import-audio.py <폴더> --write               sound.json에 배정 기록
    python import-audio.py <폴더> --map mapping.txt     수동 매핑 함께 적용
    python import-audio.py <폴더> --rename              큐 ID로 파일명 일괄 변경 (사본 생성)

--rename이 가장 확실하다. 한 번 돌려두면 VSL에서 폴더만 연결해도 전부 자동 배정된다.
"""
import argparse
import json
import pathlib
import re
import shutil
import sys

HERE = pathlib.Path(__file__).parent
AUDIO_EXT = {".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac"}

# Windows 기본 콘솔(cp949)에서 한글·기호가 깨지지 않게 한다.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# 큐별 검색 키워드 — 파일명 매칭과 SHOPPING-LIST 생성에 함께 쓴다
KEYWORDS = {
    "sfx-ui-hover": ["hover", "dust", "brush", "soft"],
    "sfx-ui-click": ["click", "switch", "toggle", "brass"],
    "sfx-ui-back": ["knock", "wood", "back", "tap"],
    "sfx-ui-tab": ["drawer", "slide", "tab"],
    "sfx-ui-disabled": ["locked", "denied", "blocked", "latch"],
    "sfx-popup-open": ["open", "glass", "lid", "cabinet"],
    "sfx-popup-close": ["close", "glass", "lid"],
    "sfx-modal-confirm": ["stamp", "seal", "wax", "confirm"],
    "sfx-modal-cancel": ["paper", "fold", "cancel"],
    "sfx-toast": ["bell", "ding", "chime", "small"],
    "sfx-failure": ["error", "gear", "grind", "fail", "clunk"],
    "sfx-coin-gain": ["coin", "gold", "spill", "money"],
    "sfx-coin-spend": ["coin", "pay", "slide"],
    "sfx-scene-in": ["door", "open", "room", "whoosh"],
    "sfx-save": ["book", "close", "clasp", "latch"],
    "sfx-settings-tick": ["dial", "notch", "tick", "detent"],
    "sfx-title-logo": ["wind", "clockwork", "spring", "bell"],
    "sfx-new-run": ["match", "strike", "lamp", "ignite", "fire"],
    "sfx-slot-select": ["card", "tap", "select"],
    "sfx-slot-delete": ["paper", "tear", "rip"],
    "sfx-load-complete": ["book", "open", "unlock"],
    "amb-loading-gears": ["clockwork", "gears", "machine", "loop"],
    "sfx-loading-done": ["stop", "bell", "complete"],
    "sfx-venue-enter": ["door", "creak", "shop", "open"],
    "sfx-day-advance": ["wind", "clock", "key", "ratchet", "spring"],
    "amb-deadline-tick": ["clock", "tick", "second", "loop"],
    "sfx-market-event": ["paper", "pin", "board", "notice"],
    "sfx-quest-accept": ["stamp", "paper", "page"],
    "sfx-appraise-start": ["glass", "rub", "lens", "magnify"],
    "sfx-appraise-reveal": ["set", "down", "desk", "wood"],
    "sfx-info-buy": ["coin", "whisper", "table"],
    "sfx-info-reveal": ["paper", "unfold", "open"],
    "sfx-sell": ["abacus", "coin", "sweep", "cash"],
    "sfx-hanbo-complete": ["chime", "success", "complete", "lock", "glass"],
    "sfx-settlement-open": ["book", "heavy", "table", "thud"],
    "sfx-loan-take": ["safe", "vault", "chain", "metal"],
    "sfx-loan-repay": ["chain", "unlock", "latch"],
    "sfx-loan-overdue": ["bell", "low", "padlock", "lock"],
    "sfx-upgrade": ["upgrade", "chime", "rise", "plate", "metal"],
    "sfx-bid-place": ["wood", "tap", "paddle", "knock"],
    "sfx-bid-bot": ["wood", "tap", "distant", "muffled"],
    "sfx-outbid": ["tense", "bass", "sting", "low"],
    "sfx-pass": ["chair", "creak", "sigh", "wood"],
    "sfx-gavel": ["gavel", "hammer", "auction", "judge", "wood"],
    "sfx-lot-next": ["cloth", "reveal", "turn", "fabric"],
    "amb-auction-crowd": ["crowd", "murmur", "ambience", "room", "loop"],
    "sfx-summary-open": ["book", "open", "page"],
    "sfx-ledger-line": ["pen", "write", "scratch", "short"],
    "sfx-profit": ["scale", "coin", "positive", "ring"],
    "sfx-loss": ["creak", "negative", "low", "scale"],
    "sfx-relic-reveal": ["cloth", "reveal", "hum", "deep", "resonant"],
    "sfx-relic-bid": ["wood", "hall", "reverb", "heavy"],
    "sfx-relic-gavel": ["gavel", "hall", "reverb", "hammer", "big"],
    "sfx-relic-acquire": ["choir", "seal", "epic", "swell"],
    "sfx-result-success": ["bell", "success", "fanfare", "wind"],
    "sfx-result-bankruptcy": ["unwind", "spring", "slow", "stop", "fail"],
    "sfx-campaign-complete": ["gears", "engage", "epic", "clockwork"],
    "sfx-museum-inspect": ["glass", "touch", "case"],
}


def load_sound():
    return json.loads((HERE / "sound.json").read_text(encoding="utf-8"))


def scan(folder):
    files = []
    for p in sorted(pathlib.Path(folder).rglob("*")):
        if p.is_file() and p.suffix.lower() in AUDIO_EXT:
            files.append(p)
    return files


def slot_ids(sound):
    """큐 ID + BGM 슬롯 ID 전체."""
    ids = [c["id"] for c in sound["sfx"]]
    for b in sound["bgm"]:
        layers = [l["id"] for l in (b.get("layers") or [])]
        if b["structure"].get("intro"):
            ids.append(b["id"] + "__intro")
        ids += [b["id"] + "__" + l for l in layers] or [b["id"] + "__loop"]
    return ids


def match(files, sound, manual):
    ids = slot_ids(sound)
    lower = {i.lower(): i for i in ids}
    exact, suggest, unused = {}, {}, []

    for p in files:
        stem = p.stem.lower()
        if stem in lower and lower[stem] not in exact:
            exact[lower[stem]] = p.name
            continue
        # 키워드 점수
        best, score = None, 0
        tokens = set(re.split(r"[^a-z0-9]+", stem))
        search_keywords = dict(KEYWORDS)
        for item in sound["sfx"]:
            search_keywords.setdefault(
                item["id"],
                [word for word in re.split(r"-+", re.sub(r"^(sfx|amb)-", "", item["id"])) if word],
            )
        for cue, words in search_keywords.items():
            if cue in exact:
                continue
            hit = sum(1 for w in words if w in tokens or w in stem)
            if hit > score:
                best, score = cue, hit
        if best and score >= 2:
            suggest.setdefault(best, []).append((p.name, score))
        else:
            unused.append(p.name)

    for cue, name in manual.items():
        exact[cue] = name
        suggest.pop(cue, None)
    return exact, suggest, unused


def read_map(path):
    out = {}
    if not path:
        return out
    for line in pathlib.Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--map")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--rename", action="store_true")
    ap.add_argument("--out", default="../assets/runtime/audio")
    args = ap.parse_args()

    src = pathlib.Path(args.folder)
    if not src.is_dir():
        sys.exit("폴더가 아닙니다: %s" % src)

    sound = load_sound()
    files = scan(src)
    if not files:
        sys.exit("오디오 파일이 없습니다: %s" % src)

    exact, suggest, unused = match(files, sound, read_map(args.map))
    ids = slot_ids(sound)
    missing = [i for i in ids if i not in exact]

    print("스캔: 파일 %d개" % len(files))
    print("배정: %d / %d 슬롯" % (len(exact), len(ids)))
    print("")

    if exact:
        print("[정확 일치]")
        for k in sorted(exact):
            print("  %-28s <- %s" % (k, exact[k]))
        print("")
    if suggest:
        print("[제안 — 확인 필요]")
        for k in sorted(suggest):
            for name, sc in sorted(suggest[k], key=lambda x: -x[1])[:3]:
                print("  %-28s ?  %s  (일치 %d)" % (k, name, sc))
        print("")
    if unused:
        print("[매칭 안 된 파일 %d개]" % len(unused))
        for n in unused[:20]:
            print("  %s" % n)
        if len(unused) > 20:
            print("  ... 외 %d개" % (len(unused) - 20))
        print("")
    if missing:
        print("[아직 파일이 없는 슬롯 %d개]" % len(missing))
        for m in missing[:30]:
            print("  %s" % m)
        if len(missing) > 30:
            print("  ... 외 %d개" % (len(missing) - 30))
        print("")

    if args.rename:
        dst = (HERE / args.out).resolve()
        by_name = {p.name: p for p in files}
        n = 0
        for cue, name in exact.items():
            p = by_name.get(name)
            if not p:
                continue
            sub = "bgm" if cue.startswith("bgm-") else ("ambience" if cue.startswith("amb-") else "sfx")
            target = dst / sub / (cue + p.suffix.lower())
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, target)
            n += 1
        print("복사 완료: %d개 -> %s" % (n, dst))

    if args.write:
        sound.setdefault("bindings", {})
        sound["bindings"] = {
            "note": "import-audio.py가 기록한다. 실제 파일명 배정.",
            "files": exact,
            "unassigned": missing,
        }
        (HERE / "sound.json").write_text(
            json.dumps(sound, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("sound.json에 배정 기록 완료")


if __name__ == "__main__":
    main()

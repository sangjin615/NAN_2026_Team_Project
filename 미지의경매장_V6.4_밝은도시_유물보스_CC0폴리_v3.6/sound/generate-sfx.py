#!/usr/bin/env python3
"""sound.json의 SFX 큐를 ElevenLabs Sound Effects API로 일괄 생성한다.

사전 준비:
    pip install requests
    set ELEVENLABS_API_KEY=<키>          (Windows CMD)
    $env:ELEVENLABS_API_KEY="<키>"       (PowerShell)

사용:
    python generate-sfx.py --dry-run              생성 없이 계획만 출력
    python generate-sfx.py                        아직 없는 파일만 생성
    python generate-sfx.py --takes 3              큐마다 3개씩 뽑아 고르기
    python generate-sfx.py --only sfx-gavel       특정 큐만 재생성
    python generate-sfx.py --group auction        특정 그룹만
    python generate-sfx.py --force                이미 있는 파일도 덮어쓰기

비용: 큐당 약 $0.0194. 58큐 x 3테이크 = 약 $3.4.
상업 이용에는 유료 플랜(Starter 이상)이 필요하다. 무료 플랜 결과물은 출처 표기 의무가 있다.

--takes 2 이상이면 <cue>__take1.wav 형태로 저장된다.
고른 뒤 <cue>.wav로 이름을 바꾸고 나머지는 지운다.
"""
import argparse
import json
import os
import pathlib
import sys
import time

API_URL = "https://api.elevenlabs.io/v1/sound-generation"
HERE = pathlib.Path(__file__).parent


def load_cues(args, data):
    cues = data["sfx"]
    if args.only:
        wanted = set(args.only)
        cues = [c for c in cues if c["id"] in wanted]
        unknown = wanted - {c["id"] for c in cues}
        if unknown:
            sys.exit("알 수 없는 큐 ID: %s" % ", ".join(sorted(unknown)))
    if args.group:
        cues = [c for c in cues if c["group"] in set(args.group)]
    return cues


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--force", action="store_true")
    p.add_argument("--takes", type=int, default=1)
    p.add_argument("--only", nargs="+")
    p.add_argument("--group", nargs="+")
    p.add_argument("--out", default="../assets/runtime/audio/sfx")
    args = p.parse_args()

    data = json.loads((HERE / "sound.json").read_text(encoding="utf-8"))
    cues = load_cues(args, data)
    outdir = (HERE / args.out).resolve()

    if not args.dry_run:
        outdir.mkdir(parents=True, exist_ok=True)

    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key and not args.dry_run:
        sys.exit("ELEVENLABS_API_KEY 환경변수가 없습니다. --dry-run으로 계획만 볼 수 있습니다.")

    if not args.dry_run:
        import requests

    planned = 0
    skipped = 0
    failed = []

    for cue in cues:
        prompt = cue.get("prompt")
        if not prompt:
            failed.append((cue["id"], "prompt 없음 — inject-prompts.py 실행 필요"))
            continue

        for take in range(1, args.takes + 1):
            stem = cue["id"] if args.takes == 1 else "%s__take%d" % (cue["id"], take)
            target = outdir / (stem + ".wav")

            if target.exists() and not args.force:
                skipped += 1
                continue

            planned += 1
            if args.dry_run:
                print("[계획] %-26s %4.2fs  %s" % (stem, cue["durationSec"], prompt[:60] + "..."))
                continue

            payload = {
                "text": prompt,
                "duration_seconds": max(0.5, min(22.0, cue["durationSec"])),
                "prompt_influence": 0.45 if cue.get("loop") else 0.6,
                "output_format": "pcm_44100",
            }
            try:
                r = requests.post(
                    API_URL,
                    headers={"xi-api-key": key, "Content-Type": "application/json"},
                    json=payload,
                    timeout=120,
                )
                r.raise_for_status()
                write_wav(target, r.content)
                print("[생성] %s" % target.name)
            except Exception as exc:  # noqa: BLE001
                failed.append((stem, str(exc)[:120]))
                print("[실패] %s — %s" % (stem, str(exc)[:80]))
            time.sleep(0.4)

    print("")
    print("계획 %d · 건너뜀(이미 있음) %d · 실패 %d" % (planned, skipped, len(failed)))
    if args.dry_run:
        print("예상 비용: 약 $%.2f (건당 $0.0194)" % (planned * 0.0194))
    for cid, why in failed:
        print("  실패 %s: %s" % (cid, why))

    loops = [c["id"] for c in cues if c.get("loop")]
    if loops and not args.dry_run:
        print("")
        print("루프 큐는 생성 후 이음매 처리가 필요합니다: %s" % ", ".join(loops))


def write_wav(path, pcm, rate=44100, channels=1, bits=16):
    """API가 헤더 없는 PCM을 주므로 RIFF 헤더를 씌워 저장한다."""
    import struct

    block = channels * bits // 8
    header = b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt "
    header += struct.pack("<IHHIIHH", 16, 1, channels, rate, rate * block, block, bits)
    header += b"data" + struct.pack("<I", len(pcm))
    path.write_bytes(header + pcm)


if __name__ == "__main__":
    main()

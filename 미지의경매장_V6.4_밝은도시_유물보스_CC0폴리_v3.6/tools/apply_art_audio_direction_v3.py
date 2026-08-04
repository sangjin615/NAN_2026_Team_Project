#!/usr/bin/env python3
"""Apply the art-led Audio v3.0 direction to the sound contract.

The cue IDs and runtime mappings stay stable.  Only the audible direction,
music metadata and generation prompts are replaced.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOUND = ROOT / "sound" / "sound.json"
RUNTIME = ROOT / "assets" / "runtime" / "audio" / "sound-runtime.js"


MUSIC = {
    "bgm-01-title": ("황금빛 창문 너머", "F major", 84, ["피치카토 현악", "클라리넷", "스피넷", "작은 프레임 드럼"], "따뜻한 항구 상회의 첫인상. 밝고 품위 있지만 영웅적이지 않은 상인 모험의 주제."),
    "bgm-02-city": ("첫 장사의 아침", "F major", 92, ["피치카토 첼로", "바순", "스피넷", "가벼운 탬버린"], "푸른 하늘과 붉은 지붕이 보이는 항구 도시. 일과 이동을 가볍게 밀어 주는 저밀도 실내악."),
    "bgm-03-auction": ("첫 번째 호가", "D dorian", 74, ["콘트라베이스", "브러시 스네어", "뮤트 피아노", "베이스 클라리넷"], "일반 경매의 절제된 살롱 누아르. 베이스가 주도하고 관악은 짧게만 개입한다."),
    "bgm-04-relic": ("금빛 홀의 마지막 호가", "D minor to F major", 72, ["콘트라베이스", "비올라", "비브라폰", "뮤트 피아노", "유리종"], "금빛 특별 경매의 격식과 긴장. 일반 경매 재즈의 어휘를 귀족적 챔버 왈츠로 확장한다."),
    "bgm-05-settlement": ("장부에 남은 하루", "D minor with F major", 68, ["스피넷", "첼로", "비올라", "연필 리듬"], "하루의 성패를 차분히 복기하는 장부 음악. 축하보다 정리와 다음 선택에 집중한다."),
    "bgm-06-archive": ("접어 둔 항구 지도", "Bb major", 64, ["뮤직박스", "클라리넷", "부드러운 현악"], "저장된 여정을 다시 펼치는 따뜻한 기억. 향수는 있으나 쓸쓸하지 않다."),
    "bgm-07-loading-workshop": ("도시가 준비되는 동안", "F major", 96, ["스피넷", "피치카토 현악", "나무 블록", "작은 황동 기어"], "지도와 상점이 차례로 배치되는 짧은 작업곡. 무거운 공장 대신 정돈된 수공업의 리듬."),
    "bgm-08-city-growth": ("분주해진 상회의 거리", "Bb major", 102, ["피치카토 현악", "클라리넷", "스피넷", "프레임 드럼"], "성장한 상회의 활기. 타이틀 모티프를 더 풍성하게 변주하되 멜로디 밀도는 낮게 유지한다."),
    "bgm-09-city-deadline": ("마감 전의 항구", "G minor with Bb major", 96, ["피치카토 첼로", "바순", "스피넷", "작은 시계 펄스"], "마감이 가까운 도시. 희망을 잃지 않은 채 시계의 압박만 조용히 더한다."),
    "bgm-10-office-appraisal": ("햇빛 아래의 감정서", "A minor with C major", 78, ["클라리넷", "플루트", "피치카토 비올라", "스피넷"], "밝고 정갈한 의뢰소. 학구적이고 친절하며 미스터리보다 관찰과 판단을 강조한다."),
    "bgm-11-tavern-whispers": ("호박빛 소문의 값", "E minor", 70, ["플럭 기타", "콘트라베이스", "베이스 클라리넷", "부드러운 하모니움"], "술집의 정보 거래. 경매 재즈와 겹치지 않는 저밀도 포크 누아르로 은밀함을 만든다."),
    "bgm-12-exchange-ledger": ("저울과 주판의 오후", "C major with mixolydian color", 98, ["스피넷", "피치카토 첼로", "침발롬", "나무 블록"], "거래소의 빠르고 명료한 상업 리듬. 카지노처럼 반짝이지 않고 일하는 손의 속도를 표현한다."),
    "bgm-13-guild-vault": ("도장 아래의 약속", "C minor with Eb major", 62, ["첼로", "바순", "하모니움", "낮은 스피넷"], "중개인 조합의 계약과 담보. 위협적 악당 음악이 아니라 무게 있고 정중한 실내악."),
    "bgm-14-merchant-workshop": ("상회의 한 칸", "F major", 88, ["피치카토 현악", "클라리넷", "스피넷", "작은 목재 퍼커션"], "진열장과 설비가 확장되는 만족감. 작업실의 규칙성과 성장의 온기를 함께 담는다."),
    "bgm-15-auction-noir": ("벨벳 위의 눈치", "E dorian", 76, ["콘트라베이스", "브러시 스네어", "뮤트 피아노", "바리톤 색소폰"], "중반 경매. 베이스 보행을 조금 늘리고 색소폰은 드문 문장 끝에만 낮게 대답한다."),
    "bgm-16-auction-pressure": ("마지막 여덟 점", "C dorian", 80, ["콘트라베이스", "브러시 스네어", "뮤트 피아노", "베이스 클라리넷", "약한 시계 펄스"], "후반 경매. 같은 살롱 재즈의 밀도를 유지하면서 호가 압박과 마감감만 높인다."),
    "bgm-17-settlement-loss": ("붉은 잉크가 마를 때", "C minor", 64, ["스피넷", "첼로", "비올라", "연필 리듬"], "적자 결산. 실패를 조롱하지 않고 숫자를 다시 살피게 하는 절제된 변주."),
    "bgm-18-ending-verdict": ("열두 번째 장부 앞에서", "D minor", 58, ["첼로", "비올라", "하모니움", "낮은 유리종"], "엔딩 판정 직전의 정적과 기대. 결과를 미리 말하지 않는 열린 화성."),
    "bgm-19-result-success": ("다음 장부의 첫 줄", "F major add6", 76, ["클라리넷", "피치카토 현악", "스피넷", "작은 종"], "성공 결과. 타이틀 주제를 따뜻하게 회수하되 승리 팡파르로 과장하지 않는다."),
    "bgm-20-result-bankruptcy": ("불이 꺼진 계산대", "D minor", 52, ["첼로", "베이스 클라리넷", "하모니움", "마른 종이"], "파산 결과. 공포나 희극 없이 존엄한 마침표와 다시 시작할 여백을 남긴다."),
    "bgm-21-museum-memory": ("유리장 안의 항해", "Bb major add6", 60, ["글라스 하모니카", "비올라", "클라리넷", "뮤직박스"], "유물 전시관. 획득한 물건이 모험의 기억으로 남는 맑고 조용한 실내악."),
}

GROUP_MATERIAL = {
    "ui": "짙은 목재 버튼, 둥근 황동 핀, 양피지 패널. 짧고 명확하며 현대 전자 클릭과 고역 반짝임 없음.",
    "entry": "여행 가방, 가죽 장부, 항구 지도, 목재 서랍. 따뜻하고 기대감 있는 작은 상승 제스처.",
    "loading": "작은 목재 톱니와 황동 캠, 카드와 지도가 정돈되는 수공업적 기계음. 공장 소음 금지.",
    "city": "항구의 문, 지도, 마차 바퀴, 낮은 시계종. 밝은 야외 공기와 실내 UI의 따뜻함을 함께 유지.",
    "office": "두꺼운 감정서, 왁스 도장, 유리 확대경, 작은 캘리퍼. 깨끗하고 학구적인 촉감.",
    "tavern": "가죽 의자, 접힌 쪽지, 나무 탁자, 묵직한 동전, 잔. 호박빛의 은밀함과 낮은 밀도.",
    "exchange": "주판, 저울, 목재 거래 토큰, 무게 있는 동전, 펜촉. 카지노식 코인 샤워 금지.",
    "guild": "계약서, 황동 클립, 금고 레버, 짧은 체인, 왁스 도장. 무겁지만 위협적이지 않음.",
    "merchant": "펠트 진열장, 목재 서랍, 작은 황동 기어, 도자기와 유리. 성장의 정돈된 만족감.",
    "auction": "목재 입찰패, 황동 호가 계수기, 가죽 의자, 장부 펜, 경매봉. 건조하고 절제된 살롱 공간.",
    "summary": "넓은 양피지 장부, 연필, 잉크, 금속 탭, 저울. 숫자 판독을 방해하지 않는 짧은 피드백.",
    "relic": "벨벳, 무거운 입찰패, 커튼 링, 유리 진열, 낮은 홀 종. 금빛 격식은 크되 판타지 폭발음 금지.",
    "result": "장부를 덮는 목재·종이·작은 종. 성공과 실패 모두 과장하지 않고 여정의 무게를 존중.",
    "meta": "유리 전시문, 펠트 받침, 작은 갤러리 조명 스위치. 맑지만 마법 반짝임처럼 들리지 않음.",
}


def main() -> None:
    data = json.loads(SOUND.read_text(encoding="utf-8"))
    data["version"] = "6.4-sound-3.0-art-directed"
    data["artAudioDirection"] = {
        "referenceRoot": "_보관_기존자료/02_UI_목업과_구에셋/",
        "identity": "따뜻한 유럽 항구의 상업 모험 · 픽셀 스토리북 · 양피지와 목재, 광택 있는 황동",
        "notThis": ["녹슨 중공업 스팀펑크", "전자식 현대 UI", "관광 엽서형 해적 음악", "코미디 재즈", "과장된 판타지 트레일러"],
        "sfxPrinciple": "실물 재질을 알아볼 수 있게 하되 게임 피드백에 맞춰 짧고 둥글게 정리한다.",
        "musicPrinciple": "친근한 챔버 포크를 중심으로 장면마다 직업과 공간의 색을 주고, 일반 경매만 저밀도 살롱 누아르 재즈를 유지·발전시킨다.",
    }
    for track in data["bgm"]:
        title, key, bpm, instruments, character = MUSIC[track["id"]]
        track.update(name=title, key=key, bpm=bpm, instrumentation=instruments, character=character)
        track["generationPrompt"] = (
            f"Art-led music for a warm illustrated European port merchant game. {character} "
            f"Tempo {bpm} BPM, key {key}. Instruments: {', '.join(instruments)}. "
            "Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. "
            "No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop."
        )
        track["notes"] = "Audio v3.0: 제공된 UI 목업의 햇빛·양피지·목재·황동 재질을 기준으로 재편성."

    for cue in data["sfx"]:
        material = GROUP_MATERIAL.get(cue.get("group"), GROUP_MATERIAL["ui"])
        cue["artMaterial"] = material
        cue["prompt"] = (
            f"{cue.get('name', cue['id'])}: {cue.get('desc', '')} {material} "
            "Stylized but physically legible pixel-game sound, warm close microphone, short dry wooden room, gentle high-frequency rolloff, no synth, no modern UI beep, no hiss, no cartoon exaggeration."
        )

    data.setdefault("generation", {})["prototype"] = {
        "engine": "deterministic art-directed procedural renderer v3.0",
        "status": "interactive prototype; replace with licensed/AI/composer masters for commercial release",
        "sampleRate": 44100,
    }
    rendered = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    SOUND.write_text(rendered, encoding="utf-8")
    RUNTIME.write_text("window.UNKNOWN_AUCTION_SOUND = " + rendered.rstrip() + ";\n", encoding="utf-8")
    print(json.dumps({"version": data["version"], "bgm": len(data["bgm"]), "cues": len(data["sfx"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()

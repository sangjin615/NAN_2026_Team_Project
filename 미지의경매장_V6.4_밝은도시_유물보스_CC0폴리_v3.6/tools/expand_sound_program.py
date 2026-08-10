#!/usr/bin/env python3
"""Expand the V6.4 audio contract into a full public-state music program.

The script is intentionally deterministic and idempotent. Existing cue IDs are
kept; new music and SFX slots are added without touching final user-supplied
audio masters.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOUND_PATH = ROOT / "sound" / "sound.json"
RUNTIME_PATH = ROOT / "assets" / "runtime" / "audio" / "sound-runtime.js"


STYLE = (
    "Recorded close-mic in a small wood-panelled late-19th-century European auction house. "
    "Warm analog tape character, narrow stereo, no digital sheen, gentle rolloff above 12kHz. "
    "Aged brass, worn dark wood, leather, glass and paper. Dry short room tail. "
    "No synth, no modern UI click, no cartoon exaggeration."
)

MUSIC_NEGATIVE = (
    "No vocals, no trailer braams, no EDM drums, no glossy modern synths, no heroic or maritime-adventure fanfare, "
    "no tourist-postcard folk, no busy lead melody, no comedy, no magical sparkle cliché, no hidden-value telegraphing. "
    "Keep the middle register open for UI sounds and preserve a seamless loop ending."
)


# V6 기획서의 핵심은 모험 관광이 아니라 '명목 가치와 실제 가치의 간극'을 읽는
# 12일짜리 상회 운영이다. 경매 재즈 3곡을 제외한 음악을 아래 팔레트로 전면 교체한다.
BGM_RETONE = {
    "bgm-01-title": {
        "name": "값을 읽는 사람",
        "character": "낙관보다 호기심이 먼저 드는 타이틀. 오래된 물건의 진짜 값을 들여다보라는 조용한 초대.",
        "key": "F major add6 with modal ambiguity", "bpm": 72,
        "instrumentation": ["비올라 피치카토", "바순", "스피넷", "하모니움", "황동 시계종"],
        "prompt": "Intimate mercantile chamber music inviting the listener to discern hidden value, viola pizzicato, bassoon, dry spinet, soft harmonium and one aged brass clock-bell motif. Curious, intelligent and quietly warm; more antique ledger than adventure anthem.",
        "notes": "전곡 공통 4음 장부 모티프를 가장 온전하게 제시한다. 해결은 완전히 닫지 않는다.",
    },
    "bgm-02-city": {
        "name": "아직 비어 있는 장부",
        "character": "1~3일차. 도시를 구경하는 음악이 아니라 오늘의 돈과 선택지를 훑는 관찰의 리듬.",
        "key": "F Mixolydian", "bpm": 78,
        "instrumentation": ["스피넷", "비올라 피치카토", "바순", "목재 계수기", "하모니움"],
        "prompt": "Early-run merchant planning chamber miniature, dry spinet, viola pizzicato, bassoon, wooden tally clicks and soft harmonium. Measured curiosity with ample rests, suggesting an empty ledger and several competing uses for limited money.",
        "notes": "정보·감정·의뢰·매입·승급 사이를 고르는 도시 페이즈의 사고 공간을 확보한다.",
    },
    "bgm-04-relic": {
        "name": "세 번 울리는 유리종",
        "character": "유물 경매 3라운드. 영웅적 승부가 아니라 12일의 돈을 영구 성장에 붓는 조용한 의식.",
        "key": "D Dorian to open fifth", "bpm": 54,
        "instrumentation": ["비올 다 감바", "포지티브 오르간", "유리 하모닉", "낮은 바순", "단일 유리종"],
        "prompt": "Intimate old-world relic ritual outside the normal economy, viola da gamba, positive organ, glass harmonics, low bassoon and a single glass bell. Three restrained stages grow through register and resonance, never through epic percussion or choir.",
        "notes": "하급·중급·상급은 음량보다 음역과 공명 범위로 확장한다. 유물의 숨은 가치를 암시하지 않는다.",
    },
    "bgm-05-settlement": {
        "name": "오늘의 손익",
        "character": "흑자·중립 결산. 축하보다 오늘의 선택을 다시 읽게 하는 장부 정리 음악.",
        "key": "D Dorian with F major color", "bpm": 58,
        "instrumentation": ["스피넷", "첼로", "비올라", "연필·종이 퍼커션"],
        "prompt": "End-of-day accounting chamber music, dry spinet, cello, viola and extremely soft pencil-and-paper rhythm. Reflective and legible, allowing the player to review purchases, quests and deadlines without a victory verdict.",
        "notes": "손익 숫자가 공개된 뒤에만 L2가 더해진다. 결과를 미리 예고하지 않는다.",
    },
    "bgm-06-archive": {
        "name": "접어 둔 여정",
        "character": "이어하기. 보관된 승부를 회상시키되 감상적으로 끌지 않는 정지된 장부의 공기.",
        "key": "Bb Lydian", "bpm": 48,
        "instrumentation": ["솔로 비올라", "스피넷", "하모니움", "종이 마찰"],
        "prompt": "A paused merchant journey inside a closed ledger, solo viola, isolated dry spinet notes, soft harmonium and faint paper movement. Suspended, familiar and unsentimental, with long silence between fragments.",
        "notes": "타이틀의 장부 모티프를 절반만 들려준다.",
    },
    "bgm-07-loading-workshop": {
        "name": "아흔여섯 개의 이름",
        "character": "여정 시작에 고정되는 96개 출품 풀과 12일 시세 경로가 조립되는 짧은 기계 소품.",
        "key": "F Dorian", "bpm": 84,
        "instrumentation": ["목재 계수기", "종이 카드", "스피넷", "저음 현 피치카토"],
        "prompt": "Compact procedural chamber miniature for sorting ninety-six auction lots and a twelve-day market path, wooden tally counter, paper cards, dry spinet and low string pizzicato. Precise, finite and handcrafted rather than whimsical clockwork spectacle.",
        "notes": "생성 작업이 끝날수록 패턴이 정렬되는 인상을 준다.",
    },
    "bgm-08-city-growth": {
        "name": "쌓이는 장부의 무게",
        "character": "4~8일차. 상회가 커져 선택지가 늘지만 동시에 지출의 책임도 무거워지는 중반 운영곡.",
        "key": "Bb Mixolydian", "bpm": 82,
        "instrumentation": ["첼로 피치카토", "스피넷", "바순", "비올라 대선율", "목재 계수기"],
        "prompt": "Mid-run merchant operations chamber music, cello pizzicato, dry spinet, bassoon, restrained viola counterline and wooden tally clicks. The ledger is fuller and decisions are denser; confidence grows without turning triumphant or busy.",
        "notes": "초반 도시곡과 같은 모티프에 낮은 대선율 하나만 추가한다.",
    },
    "bgm-09-city-deadline": {
        "name": "마감 전의 거리",
        "character": "9~12일차. 속도를 올리기보다 쉼표를 줄이고 낮은 시계 박동으로 마감 압박을 만든다.",
        "key": "G Dorian", "bpm": 76,
        "instrumentation": ["첼로 피치카토", "바순", "스피넷", "낮은 목재 시계", "하모니움"],
        "prompt": "Late-run city planning under a hard shop-upgrade deadline, cello pizzicato, bassoon, dry spinet, low wooden clock pulse and harmonium. Determined and compressed, increasing pressure through shorter rests rather than faster action rhythm.",
        "notes": "실패 확률이나 숨은 상태가 아니라 공개된 일차만 반영한다.",
    },
    "bgm-10-office-appraisal": {
        "name": "확대경 아래의 침묵",
        "character": "감정은 정답 공개가 아니라 오차를 줄이는 구매다. 분석적이되 마법처럼 들리지 않는다.",
        "key": "A Dorian", "bpm": 52,
        "instrumentation": ["스피넷", "비올라 하모닉", "바순", "유리 렌즈 마찰", "종이"],
        "prompt": "Forensic antique appraisal chamber underscore, isolated spinet intervals, viola harmonics, low bassoon, faint glass-lens friction and paper. Analytical uncertainty, never a magical reveal and never implying an item's hidden quality.",
        "notes": "불협은 남기되 감정 결과의 좋고 나쁨을 음악으로 누설하지 않는다.",
    },
    "bgm-11-tavern-whispers": {
        "name": "낮은 목소리의 거래",
        "character": "술집 정보 거래. 재즈를 빼고 피치카토와 낮은 목관으로 은밀한 흥정을 표현한다.",
        "key": "E Dorian", "bpm": 60,
        "instrumentation": ["비올라 피치카토", "베이스클라리넷", "뮤트 만돌린", "하모니움", "잔 마찰"],
        "prompt": "Secretive information barter in a warm old tavern without jazz language, viola pizzicato, bass clarinet, muted mandolin, soft harmonium and rare glass-rim friction. Sparse, conversational and suspicious, with no drum kit and no saxophone.",
        "notes": "경매 재즈와 영역을 분리한다. 정보 자체의 진위를 예고하지 않는다.",
    },
    "bgm-12-exchange-ledger": {
        "name": "저울은 기억한다",
        "character": "거래소. 즉시 처분과 족보 대기의 판단을 비대칭 5박 장부 리듬으로 표현한다.",
        "key": "C Dorian", "bpm": 70,
        "instrumentation": ["스피넷", "첼로 피치카토", "주판·저울 퍼커션", "바순"],
        "prompt": "Antique exchange ledger in a restrained asymmetric five-beat pulse, dry spinet, cello pizzicato, sparse abacus and balance-scale percussion, bassoon. Suggests the choice between selling now and holding for a collection, precise but unobtrusive.",
        "notes": "왈츠·카페 음악 인상을 제거하고 계산의 비대칭성을 남긴다.",
    },
    "bgm-13-guild-vault": {
        "name": "담보로 잠긴 서랍",
        "character": "조합·대출. 위협이 아니라 미래 선택지를 잠그는 생존 비용의 무게.",
        "key": "C Aeolian", "bpm": 46,
        "instrumentation": ["첼로", "콘트라바순", "하모니움", "낮은 체인", "목재 서랍"],
        "prompt": "Restrained collateral-loan chamber music, cello, contrabassoon, soft harmonium, one low chain movement and a wooden drawer latch. Weighty and contractual rather than sinister, expressing survival bought by locking away future options.",
        "notes": "공포·악당 음악을 금지한다. 대출은 위기에서 한 번쯤 쓰는 유동성 장치다.",
    },
    "bgm-14-merchant-workshop": {
        "name": "상회의 한 칸",
        "character": "승급은 영웅적 성장보다 보관·수수료·정보·족보·보상 다섯 조건이 맞물리는 운영 결정.",
        "key": "F major add2", "bpm": 74,
        "instrumentation": ["스피넷", "비올라·첼로 피치카토", "바순", "목재 톱니", "하모니움"],
        "prompt": "Merchant-house upgrade chamber miniature, dry spinet, viola and cello pizzicato, bassoon, wooden gear movement and soft harmonium. Five interlocking benefits click into place with sober satisfaction, never a level-up fanfare.",
        "notes": "승급 순간의 성취는 SFX가 맡고 BGM은 판단 공간을 유지한다.",
    },
    "bgm-17-settlement-loss": {
        "name": "붉은 잉크가 마를 때",
        "character": "적자 결산. 벌이나 비극이 아니라 다음 판단을 위한 원인 복기.",
        "key": "C Dorian with suspended second", "bpm": 52,
        "instrumentation": ["스피넷", "첼로", "비올라", "낮은 하모니움", "연필"],
        "prompt": "A negative ledger reviewed without melodrama, sparse dry spinet, cello, viola, low harmonium and faint pencil rhythm. Cool, recoverable and diagnostic; the same musical family as profit settlement with one unresolved interval.",
        "notes": "흑자 결산과 악기군·모티프는 같고 종지만 다르다.",
    },
    "bgm-18-ending-verdict": {
        "name": "열두 번째 장부를 덮기 전",
        "character": "12일차 정산 뒤 유물 경매 자격을 판정하는 문턱. 거의 멈춘 시간과 한 번의 저울 소리.",
        "key": "D open fifth", "bpm": 40,
        "instrumentation": ["비올 다 감바", "하모니움", "목재 시계", "단일 저울추"],
        "prompt": "Nearly motionless chamber threshold after the twelfth day, viola da gamba, soft harmonium, an irregular wooden clock and one distant balance weight. Suspended evaluation with large silence, not suspense cinema.",
        "notes": "이미 공개된 판정만 따른다. 자격 결과가 나오기 전에는 장·단조를 확정하지 않는다.",
    },
    "bgm-19-result-success": {
        "name": "다음 장부의 첫 줄",
        "character": "완주·유물 획득. 승리 팡파르 대신 배운 것을 들고 다음 여정으로 넘어가는 단단한 여운.",
        "key": "F major add6", "bpm": 60,
        "instrumentation": ["비올라", "바순", "스피넷", "하모니움", "황동 시계종"],
        "prompt": "Earned continuation after a successful relic purchase, viola, bassoon, dry spinet, soft harmonium and a restrained aged brass clock bell. The title ledger motif finally resolves but immediately leaves one open note for the next journey.",
        "notes": "타이틀 모티프를 처음으로 해결한 뒤 마지막 한 음은 열어 둔다.",
    },
    "bgm-20-result-bankruptcy": {
        "name": "태엽이 풀린 자리",
        "character": "파산·마감 미달·빈손. 공포나 비극이 아니라 움직임이 사라진 상회와 남은 유물의 기억.",
        "key": "D Dorian unresolved", "bpm": 38,
        "instrumentation": ["솔로 첼로", "하모니움", "느슨해지는 태엽", "종이"],
        "prompt": "A merchant mechanism quietly losing tension after failure, solo cello, soft harmonium, slack mainspring texture and one folded sheet of paper. Bittersweet, spacious and dignified, with no funeral cadence and no horror.",
        "notes": "실패해도 영구 유물은 남는 캠페인 구조 때문에 완전한 종말처럼 쓰지 않는다.",
    },
    "bgm-21-museum-memory": {
        "name": "남겨진 아홉 개의 기억",
        "character": "전시관. 유물은 돈으로 환산되지 않는 영구 성장이라는 사실을 조용히 확인하는 기억의 방.",
        "key": "Bb Lydian", "bpm": 44,
        "instrumentation": ["비올라 다 감바", "유리 하모닉", "스피넷", "포지티브 오르간"],
        "prompt": "A quiet cabinet of permanent relic memories beyond gold value, viola da gamba, glass harmonics, isolated spinet and positive organ. Fragmentary quotations of the title ledger motif, intimate, timeless and materially antique rather than magical.",
        "notes": "유물 9종을 과장된 웅장함 대신 서로 다른 기억의 조각으로 취급한다.",
    },
}


# 밝고 선명한 픽셀아트 UI에 맞춘 초반 상호작용 팔레트. 사실적인 고물상 폴리보다
# 둥근 목재 타격 + 작은 황동 배음이 먼저 들리며, 현대 디지털 클릭은 쓰지 않는다.
SFX_RETONE = {
    "sfx-ui-hover": {
        "desc": "금빛 테두리에 작은 황동 포인터가 닿는 아주 얕은 소리",
        "durationSec": 0.07, "gain": -20,
        "prompt": "An extremely soft rounded brass pointer touching the gold edge of a wooden pixel-game menu, warm and tiny, no hiss.",
    },
    "sfx-ui-click": {
        "desc": "두꺼운 목재 버튼이 눌리고 작은 황동 접점이 붙는 소리",
        "durationSec": 0.13, "gain": -15,
        "prompt": "A rounded wooden menu button press followed by one tiny warm brass contact, crisp enough for a pixel game but antique and non-digital.",
    },
    "sfx-ui-back": {
        "desc": "목재 메뉴 패가 레일을 따라 짧게 뒤로 미끄러짐",
        "durationSec": 0.18, "gain": -16,
        "prompt": "A small wooden menu plaque sliding one notch backward on a felt-lined rail.",
    },
    "sfx-ui-disabled": {
        "desc": "작은 목재 걸쇠가 잠긴 홈에 둥글게 걸림",
        "durationSec": 0.12, "gain": -17,
        "prompt": "A small rounded wooden latch stopping gently in a locked groove, informative rather than punishing.",
    },
    "sfx-title-logo": {
        "desc": "샹들리에 아래 시계 장치가 세 칸 맞물리고 낮은 황동 종이 울림",
        "durationSec": 1.35, "gain": -12,
        "prompt": "Three measured wooden clockwork engagements beneath an antique chandelier, ending in one warm low brass bell.",
    },
    "sfx-new-run": {
        "desc": "목재 간판 걸쇠가 열리고 따뜻한 황동 3음이 짧게 상승",
        "durationSec": 0.82, "gain": -11,
        "prompt": "A wooden sign latch opening, followed by three short warm brass coin-tones rising gently, welcoming but not triumphant.",
    },
    "sfx-venue-enter": {
        "desc": "도시 건물의 둥근 목재 문고리와 짧은 문 열림",
        "durationSec": 0.42, "gain": -15,
        "prompt": "A rounded wooden town-building latch and a short warm door opening, stylized for bright pixel art, no whoosh.",
    },
    "sfx-scene-in": {
        "desc": "큰 목재 문이 열리고 공간의 낮은 공기가 짧게 바뀜",
        "durationSec": 0.58, "gain": -15,
        "prompt": "A larger wooden interior door opening with a brief low room-air change, warm and restrained, no synthetic sweep.",
    },
}


def music(
    ident: str,
    name: str,
    character: str,
    key: str,
    bpm: int,
    instruments: list[str],
    scenes: list[str],
    prompt: str,
    *,
    intro: bool = False,
    layers: list[tuple[str, str, str]] | None = None,
    role: str = "static",
    loop_sec: int = 120,
    notes: str = "",
) -> dict:
    layer_data = None
    if layers:
        layer_data = [
            {"id": lid, "name": lname, "content": content, "trigger": trigger, "fadeSec": 2.0}
            for lid, lname, content, trigger in layers
        ]
    return {
        "id": ident,
        "name": name,
        "character": character,
        "key": key,
        "bpm": bpm,
        "instrumentation": instruments,
        "structure": {
            "intro": "4~8마디 · 원샷 · 루프 제외" if intro else None,
            "loop": "64마디 또는 90~150초 seamless loop",
        },
        "durationSec": ({"intro": 14, "loop": loop_sec} if intro else {"loop": loop_sec}),
        "layers": layer_data,
        "adaptiveRole": role,
        "scenes": scenes,
        "generationPrompt": prompt + " " + MUSIC_NEGATIVE,
        "notes": notes,
    }


def cue(
    ident: str,
    group: str,
    name: str,
    desc: str,
    sec: float,
    gain: int,
    prompt: str,
    *,
    accent: bool = False,
    loop: bool = False,
) -> dict:
    return {
        "id": ident,
        "group": group,
        "name": name,
        "desc": desc,
        "durationSec": sec,
        "bus": "ambience" if loop else "sfx",
        "gain": gain,
        "accent": accent,
        **({"loop": True} if loop else {}),
        "prompt": prompt + " " + STYLE,
    }


def build_bgm() -> list[dict]:
    auction_layers = [
        ("L1", "base", "콘트라베이스와 브러시만", "경매 진입 시 항상"),
        ("L2", "pressure", "비브라폰·뮤트 피아노의 얇은 코드", "공개 호가가 시작가의 2배 초과"),
        ("L3", "closing", "색소폰 또는 베이스클라리넷 2~3음", "마지막 LOT 또는 공개된 시간 임박"),
    ]
    relic_layers = [
        ("L1", "하급", "비올 다 감바·포지티브 오르간·낮은 홀 공기", "라운드 1"),
        ("L2", "중급", "유리 하모닉과 낮은 바순 추가", "라운드 2"),
        ("L3", "상급", "단일 유리종과 넓어진 음역 추가", "라운드 3"),
    ]
    settlement_layers = [
        ("L1", "ledger", "스피넷·첼로·연필 리듬", "결산 진입"),
        ("L2", "reflection", "비올라 대선율 추가", "결과가 화면에 모두 공개된 뒤"),
    ]
    tracks = [
        music("bgm-01-title", "황동 창문 너머의 항구", "희망찬 상인 모험의 주제. 고급스럽고 따뜻하다.", "F major", 86,
              ["피치카토 현악", "클라리넷", "바순", "하모니움", "작은 태엽 퍼커션"], ["scene-title"],
              "Hopeful chamber-folk merchant adventure in a sunlit European port, pizzicato strings, clarinet, bassoon, subtle harmonium and tiny clockwork percussion, elegant and restrained.", intro=True, loop_sec=112),
        music("bgm-02-city", "첫 장사의 아침", "1~3일차. 가볍고 여백이 많은 도시의 출발.", "F major", 96,
              ["피치카토 현악", "클라리넷", "업라이트 피아노", "브러시"], ["scene-city"],
              "Early-run European market morning, light pizzicato strings, clarinet, upright piano and tiny brushed percussion, curious and hopeful, unobtrusive.", loop_sec=126),
        music("bgm-03-auction", "첫 번째 호가", "1~4일차. 조심스럽고 건조한 저밀도 경매 재즈.", "D Dorian", 74,
              ["콘트라베이스", "브러시", "비브라폰", "베이스클라리넷"], ["scene-auction"],
              "Sparse cool noir jazz for an antique auction, double bass leading, brushes, rare vibraphone and bass clarinet punctuation, much lower density than Pink Panther, background only.", layers=auction_layers, role="auction", loop_sec=144),
        music("bgm-04-relic", "왕관 아래의 최종 호가", "유물 경매 3라운드. 품격과 평가의 무게가 단계적으로 상승.", "D minor to D major", 68,
              ["저현", "하모니움", "팀파니", "낡은 금속", "낮은 합창"], ["scene-final"],
              "Grand restrained relic auction in a luminous old European hall, low strings, harmonium, timpani, aged metal resonance and very low wordless choir, ceremonial rather than bombastic.", intro=True, layers=relic_layers, role="relic", loop_sec=168),
        music("bgm-05-settlement", "장부에 남은 하루", "흑자·중립 결산. 성취보다 복기에 초점.", "D minor with F major color", 70,
              ["업라이트 피아노", "첼로", "얇은 현", "뮤직박스"], ["scene-summary"],
              "Reflective end-of-day ledger music, intimate upright piano, cello, very light strings and a dusty music box, calm satisfaction without victory fanfare.", layers=settlement_layers, role="settlement", loop_sec=108),
        music("bgm-06-archive", "봉인된 장부", "이어하기 화면. 저장된 여정을 조용히 펼치는 느낌.", "Bb major", 66,
              ["뮤직박스", "하모니움", "종이 질감", "솔로 비올라"], ["scene-continue"],
              "Quiet archive room, dusty music box, soft harmonium and solo viola, the feeling of reopening a sealed merchant ledger, spacious and warm.", loop_sec=96),
        music("bgm-07-loading-workshop", "도시가 조립되는 동안", "여정 생성. 태엽과 지도 제작의 짧은 작업곡.", "F major", 92,
              ["목재 블록", "라쳇", "피치카토", "하모니움"], ["scene-loading"],
              "A compact clockmaker workshop assembling a map, wooden blocks, ratchets, pizzicato strings and subtle harmonium, anticipatory and mechanical but not industrial.", loop_sec=84),
        music("bgm-08-city-growth", "커지는 상회, 분주한 거리", "4~8일차. 상업 규모가 커진 도시의 활기.", "Bb major", 102,
              ["피치카토 현악", "바순", "클라리넷", "프레임 드럼", "기어 셰이커"], ["scene-city"],
              "Busy but elegant European trading town, buoyant pizzicato strings, bassoon, clarinet, frame drum and tiny gear shaker, confident mid-run momentum.", loop_sec=132),
        music("bgm-09-city-deadline", "마지막 항로", "9~12일차. 희망은 유지하되 시계 압박이 스민 도시.", "G minor with Bb major", 94,
              ["첼로 피치카토", "클라리넷", "하모니움", "시계 펄스"], ["scene-city"],
              "Late-run merchant city under deadline pressure, cello pizzicato, clarinet, harmonium and a subtle clock pulse, determined not tragic, low melodic density.", loop_sec=128),
        music("bgm-10-office-appraisal", "렌즈와 봉인", "의뢰·감정. 분석적이고 집중을 방해하지 않는 실내악.", "A minor", 64,
              ["비올라", "클라리넷", "첼레스타", "종이 퍼커션"], ["scene-office"],
              "Quiet appraisal office chamber underscore, viola, clarinet, sparse celesta and paper percussion, analytical and tactile, never magical or revealing.", loop_sec=110),
        music("bgm-11-tavern-whispers", "벽난로 뒤의 소문", "술집 정보 거래. 느슨하지만 의심스러운 저밀도 재즈.", "E minor", 76,
              ["콘트라베이스", "브러시", "뮤트 기타", "드문 테너 색소폰"], ["scene-tavern"],
              "Very sparse tavern noir jazz, warm double bass, brushes, muted hollow-body guitar and extremely rare tenor sax accents, background whispers and fireplace warmth.", loop_sec=142),
        music("bgm-12-exchange-ledger", "저울과 시세표", "거래소. 숫자가 맞물리는 정돈된 3박자.", "C minor", 84,
              ["업라이트 피아노", "피치카토 첼로", "목재 블록", "아코디언"], ["scene-exchange"],
              "Orderly antique exchange waltz, upright piano, pizzicato cello, wooden blocks and very light accordion, the rhythm of ledgers and balance scales.", loop_sec=120),
        music("bgm-13-guild-vault", "금고 아래의 약속", "조합·대출. 무겁고 신중하며 위협적이지 않은 책임감.", "C minor", 60,
              ["저현", "바순", "하모니움", "체인 퍼커션"], ["scene-guild"],
              "Low restrained guild vault underscore, low strings, bassoon, harmonium and sparse chain percussion, weight of obligation without villainy.", loop_sec=118),
        music("bgm-14-merchant-workshop", "상회의 톱니", "상회·승급. 성장과 제작의 손맛.", "F major", 98,
              ["피치카토", "목재 망치", "라쳇", "클라리넷", "호른"], ["scene-merchant"],
              "Elegant merchant workshop growth music, pizzicato strings, wooden mallets, ratchets, clarinet and restrained horn, satisfying construction without fanfare.", loop_sec=116),
        music("bgm-15-auction-noir", "베넷의 시선", "5~8일차. 경쟁자의 의도를 읽는 중기 경매 재즈.", "E minor", 78,
              ["콘트라베이스", "브러시", "뮤트 피아노", "바리톤 색소폰"], ["scene-auction"],
              "Mid-run antique auction noir jazz, double bass ostinato, soft brushes, muted piano, very rare baritone saxophone kicks, calculating and low-density.", layers=auction_layers, role="auction", loop_sec=150),
        music("bgm-16-auction-pressure", "마지막 여덟 점", "9~12일차. 시계 압박과 절제된 집중이 공존.", "C minor", 82,
              ["콘트라베이스", "브러시", "베이스클라리넷", "짧은 금속 펄스"], ["scene-auction"],
              "Late-run high-stakes auction, restrained double bass and brushes, bass clarinet breaths and faint clockwork metal pulse, tense but never action music.", layers=auction_layers, role="auction", loop_sec=150),
        music("bgm-17-settlement-loss", "기울어진 저울", "적자 결산. 자책보다 차분한 원인 복기.", "C minor", 64,
              ["업라이트 피아노", "첼로", "하모니움", "낮은 시계음"], ["scene-summary"],
              "Understated loss settlement, sparse upright piano, cello, harmonium and a distant low clock, reflective and recoverable rather than tragic.", layers=settlement_layers, role="settlement", loop_sec=104),
        music("bgm-18-ending-verdict", "열두 번째 날의 판정", "유물 경매 자격을 판정하는 문턱. 정지된 시간 같은 긴장.", "D minor", 58,
              ["저현", "하모니움", "팀파니 롤", "단일 종"], ["scene-ending"],
              "Suspended final verdict after twelve days, low strings, harmonium, nearly inaudible timpani roll and one distant bell, ceremonial suspense with much silence.", loop_sec=92),
        music("bgm-19-result-success", "다시 감긴 태엽", "완주·유물 획득 결과. 조용하고 단단한 성취.", "D major", 76,
              ["현악", "클라리넷", "하모니움", "작은 종"], ["scene-result"],
              "Quiet earned success, warm chamber strings, clarinet, harmonium and three small antique bells, mature satisfaction and a hint of the next journey.", loop_sec=104),
        music("bgm-20-result-bankruptcy", "멈춘 상회 시계", "파산·마감 실패. 태엽이 풀린 뒤 남는 고요.", "D minor", 52,
              ["첼로", "하모니움", "느슨해지는 태엽", "공기음"], ["scene-result"],
              "A shop clock winding down after failure, sparse cello and harmonium with subtle slack mainspring texture and long quiet spaces, bittersweet not horror.", loop_sec=88),
        music("bgm-21-museum-memory", "유리 진열장 속의 항해", "영구 유물 전시관. 이전 여정의 기억과 수집의 품격.", "Bb major", 62,
              ["뮤직박스", "비올라", "유리 하모닉", "하모니움"], ["scene-museum"],
              "Intimate relic museum memory, dusty music box, viola, soft glass harmonics and harmonium, timeless and collectible, spacious and elegant.", loop_sec=124),
    ]
    for track in tracks:
        override = BGM_RETONE.get(track["id"])
        if not override:
            continue
        track.update({key: value for key, value in override.items() if key not in {"prompt", "notes"}})
        track["generationPrompt"] = override["prompt"] + " " + MUSIC_NEGATIVE
        track["notes"] = override.get("notes", "")
    return tracks


def new_cues() -> list[dict]:
    return [
        cue("sfx-ui-toggle-on", "ui", "토글 켜짐", "작은 황동 접점이 맞물림", .14, -14, "A tiny brass electrical-mechanical contact engaging with a soft detent."),
        cue("sfx-ui-toggle-off", "ui", "토글 꺼짐", "황동 접점이 풀리며 낮게 돌아옴", .15, -15, "A tiny brass toggle disengaging and returning with a muted lower click."),
        cue("sfx-ui-focus", "ui", "입력 포커스", "연필이 장부 위에 놓임", .12, -17, "A wooden pencil placed lightly on an old ledger."),
        cue("sfx-ui-number-step", "ui", "숫자 증감", "소형 계수기 한 칸 이동", .09, -16, "One step of a small mechanical tally counter."),
        cue("sfx-page-turn", "ui", "페이지 넘김", "두꺼운 장부 한 장 넘김", .34, -15, "One thick aged ledger page turning and settling."),
        cue("sfx-tooltip-open", "ui", "도움말 펼침", "작은 종이 탭이 빠져나옴", .18, -18, "A tiny paper index tab sliding out from a ledger."),
        cue("amb-city-harbor", "city", "도시 항구 공기", "먼 항구·바람·수레가 섞인 낮은 도시 루프", 18.0, -27, "Seamless quiet European port-town ambience, distant cart wheels, sail cloth and wind, no clear voices, no prominent gulls.", loop=True),
        cue("amb-office-paper", "office", "의뢰소 실내", "종이·깃펜·작은 벽시계의 실내 루프", 16.0, -29, "Seamless quiet appraisal office room tone with occasional paper, quill and a tiny wall clock.", loop=True),
        cue("amb-tavern-hearth", "tavern", "술집 화로", "벽난로·잔·알아들을 수 없는 낮은 웅성거림", 18.0, -27, "Seamless restrained tavern hearth, occasional glass and unintelligible distant murmurs, no foreground voice.", loop=True),
        cue("amb-exchange-floor", "exchange", "거래소 장부실", "펜·주판·저울이 드문드문 들리는 루프", 18.0, -29, "Seamless antique exchange room, sparse pen scratches, abacus beads and balance scale movement." , loop=True),
        cue("amb-guild-vault", "guild", "조합 금고실", "돌방 공기·체인·멀리서 잠금장치가 움직이는 루프", 20.0, -30, "Seamless stone guild vault room tone with rare chain movement and a distant lock mechanism.", loop=True),
        cue("amb-merchant-workshop", "merchant", "상회 작업실", "목재 작업대와 저속 톱니의 루프", 18.0, -28, "Seamless merchant workshop, slow wooden clockwork gears and occasional tool movement, refined not factory-like.", loop=True),
        cue("amb-relic-hall", "relic", "유물 경매 홀", "큰 홀의 공기와 옷감·의자 움직임", 20.0, -29, "Seamless grand auction hall ambience, soft fabric and chair movement, vast restrained room resonance, no intelligible speech.", loop=True),
        cue("amb-museum-room", "meta", "유물 전시관 공기", "유리 진열장과 조용한 목재 전시실", 22.0, -31, "Seamless silent relic museum room tone, faint glass cabinet resonance and old wood settling.", loop=True),
        cue("sfx-city-map-open", "city", "도시 지도 펼침", "큰 양피지 지도를 테이블에 펼침", .55, -13, "A large parchment city map unfurled across a wooden table."),
        cue("sfx-city-location-lock", "city", "잠긴 거점", "문 손잡이가 잠긴 채 짧게 걸림", .22, -15, "An old brass door handle turning slightly against a locked latch."),
        cue("sfx-market-rise", "city", "시세 상승 표시", "시세판 핀이 위 칸으로 이동", .28, -14, "A brass marker sliding one notch upward on a wooden market board, no celebratory chime."),
        cue("sfx-market-fall", "city", "시세 하락 표시", "시세판 핀이 아래 칸으로 이동", .30, -14, "A brass marker sliding one notch downward on a wooden market board, restrained and dry."),
        cue("sfx-deadline-warning", "city", "마감 임박", "낮은 벽시계 종 한 번과 태엽 장력", 1.0, -11, "One low antique wall-clock bell followed by a short tightening mainspring."),
        cue("sfx-quest-select", "office", "의뢰 선택", "의뢰 카드가 목재 레일에 꽂힘", .24, -14, "A thick contract card inserted into a wooden rail."),
        cue("sfx-quest-success", "office", "의뢰 성공", "밀랍 봉인과 작은 황동 체결", .58, -10, "A wax contract seal pressed, followed by a small brass latch engaging.", accent=True),
        cue("sfx-quest-fail", "office", "의뢰 실패", "봉인이 깨지고 종이가 접힘", .48, -12, "A small wax seal cracking and the contract paper folding shut."),
        cue("sfx-appraise-tool", "office", "감정 도구 교체", "렌즈와 황동 캘리퍼를 내려놓음", .36, -15, "A glass loupe and small brass calipers placed on a felt-lined wooden desk."),
        cue("sfx-rumor-select", "tavern", "정보상 선택", "가죽 의자를 당기고 동전 한 닢을 놓음", .42, -15, "A leather chair drawn closer and one coin placed discreetly on a tavern table."),
        cue("sfx-rumor-card", "tavern", "정보 카드 확인", "접힌 쪽지가 손가락 사이에서 열림", .30, -16, "A small folded rumor note opened carefully between the fingers."),
        cue("sfx-exchange-item-select", "exchange", "판매품 선택", "목재 거래 토큰이 칸에 놓임", .16, -15, "A small wooden trade token placed into a ledger slot."),
        cue("sfx-sale-confirm", "exchange", "판매 확정", "주판 알이 이동하고 동전이 안착", .55, -10, "A short sweep of abacus beads followed by two heavy coins settling."),
        cue("sfx-hanbo-piece-fit", "exchange", "족보 조각 결합", "여러 목재·황동 조각 중 하나가 홈에 맞음", .22, -13, "One small wood-and-brass collection piece fitting precisely into a display groove."),
        cue("sfx-market-graph-draw", "exchange", "시세선 그리기", "펜이 그래프 선을 길게 긋고 핀을 꽂음", .70, -15, "A fountain pen drawing a market graph line, ending with a tiny brass pin placed."),
        cue("sfx-collateral-select", "guild", "담보 선택", "물건표에 무거운 황동 클립을 채움", .32, -13, "A heavy brass collateral clip fastened to an item tag."),
        cue("sfx-loan-seal", "guild", "대출 계약 체결", "금고 레버·체인·밀랍 봉인이 순서대로 체결", 1.15, -8, "A vault lever engaging, a short chain tightening, then a wax loan seal pressed.", accent=True),
        cue("sfx-loan-warning", "guild", "대출 만기 경고", "낮은 금고 종과 자물쇠 장력", .85, -11, "A low vault warning bell and a padlock shackle tightening once."),
        cue("sfx-inventory-pick", "merchant", "보유품 집기", "펠트 위 물건을 들어 올림", .20, -16, "A small antique object lifted from a felt-lined wooden shelf."),
        cue("sfx-capacity-full", "merchant", "보관칸 가득 참", "서랍이 걸려 더 닫히지 않음", .32, -13, "A packed wooden drawer stopping against its contents and refusing to close."),
        cue("sfx-upgrade-ready", "merchant", "승급 가능", "세 개의 작은 기어가 차례로 맞물림", .72, -11, "Three small brass gears engaging one after another, restrained and satisfying."),
        cue("sfx-bid-increment", "auction", "입찰 증액 버튼", "입찰 계수기 한 칸 증가", .10, -15, "One dry step of a brass auction bid counter."),
        cue("sfx-bid-direct-input", "auction", "직접 입찰 입력", "기계식 숫자 다이얼이 빠르게 정렬", .28, -14, "Several small mechanical number wheels rapidly aligning to a bid amount."),
        cue("sfx-auction-countdown", "auction", "경매 마감 초읽기", "나무 시계의 얕은 초침 1회", .12, -17, "One soft wooden auction timer tick, dry and unobtrusive."),
        cue("sfx-lot-win", "auction", "플레이어 낙찰", "입찰패가 받침에 놓이고 작은 황동 태그 체결", .75, -9, "An auction paddle placed on its stand and a small brass ownership tag clipped on.", accent=True),
        cue("sfx-lot-lose", "auction", "경쟁자 낙찰", "먼 입찰패와 장부 기입", .55, -14, "A distant auction paddle settling and a clerk making one short ledger entry."),
        cue("sfx-bot-pass", "auction", "경쟁자 패스", "먼 의자와 입찰패가 조용히 내려감", .45, -17, "A distant leather chair easing back and a wooden paddle set down quietly."),
        cue("sfx-bid-jump", "auction", "큰 폭의 호가 상승", "무거운 계수기가 여러 칸 빠르게 이동", .38, -12, "A heavy brass bid counter ratcheting several steps in quick succession."),
        cue("sfx-summary-quest-success", "summary", "결산 의뢰 성공", "장부 초록 탭과 밀랍 도장", .52, -11, "A ledger success tab sliding out and a wax approval stamp pressed."),
        cue("sfx-summary-quest-fail", "summary", "결산 의뢰 실패", "장부 붉은 탭과 부러진 봉인", .52, -12, "A ledger failure tab sliding out and a small wax seal cracking."),
        cue("sfx-deadline-cleared", "summary", "마감 통과", "큰 기어가 다음 홈에 안전하게 걸림", .82, -9, "A large clockwork gear advancing and locking safely into its next notch.", accent=True),
        cue("sfx-relic-round-intro", "relic", "유물 라운드 개시", "커튼 고리와 낮은 홀 종", 1.15, -8, "Heavy curtain rings drawing apart followed by one low ceremonial hall bell.", accent=True),
        cue("sfx-tycoon-bid", "relic", "거물 입찰", "먼 대형 입찰패와 넓은 홀 잔향", .68, -11, "A wealthy rival's large wooden bidding paddle raised across a grand hall, distant and resonant."),
        cue("sfx-relic-pass", "relic", "유물 경매 패스", "두꺼운 장갑과 무거운 입찰패가 내려감", .62, -13, "A gloved hand lowering a heavy auction paddle onto velvet."),
        cue("sfx-relic-lost", "relic", "유물 낙찰 실패", "금속 봉인이 다른 쪽에서 닫히는 먼 울림", 1.0, -11, "A large metal ownership seal closing at a distance in a grand hall."),
        cue("sfx-next-journey", "result", "다음 여정", "태엽 열쇠를 다시 꽂아 반 바퀴 감음", .72, -10, "A brass clockwork key inserted and wound half a turn for another journey."),
        cue("sfx-museum-unlock", "meta", "전시관 해금", "유리문 잠금과 조명이 차례로 켜짐", 1.25, -8, "A glass cabinet lock opening, then three small gallery lamp switches engaging.", accent=True),
        cue("sfx-relic-display-set", "meta", "유물 전시", "펠트 받침에 유물을 놓고 유리문을 닫음", .95, -11, "A precious relic placed on a felt plinth and a glass display door closing softly."),
    ]


def build_scene_map() -> dict:
    return {
        "scene-title": {"bgm": "bgm-01-title"},
        "scene-continue": {"bgm": "bgm-06-archive"},
        "scene-loading": {"bgm": "bgm-07-loading-workshop"},
        "scene-city": {
            "bgm": "bgm-02-city",
            "variants": [
                {"bgm": "bgm-02-city", "when": {"dayMax": 3}},
                {"bgm": "bgm-08-city-growth", "when": {"dayMin": 4, "dayMax": 8}},
                {"bgm": "bgm-09-city-deadline", "when": {"dayMin": 9}},
            ],
        },
        "scene-office": {"bgm": "bgm-10-office-appraisal"},
        "scene-tavern": {"bgm": "bgm-11-tavern-whispers"},
        "scene-exchange": {"bgm": "bgm-12-exchange-ledger"},
        "scene-guild": {"bgm": "bgm-13-guild-vault"},
        "scene-merchant": {"bgm": "bgm-14-merchant-workshop"},
        "scene-auction": {
            "bgm": "bgm-03-auction", "layers": ["L1"],
            "variants": [
                {"bgm": "bgm-03-auction", "layers": ["L1"], "when": {"dayMax": 4}},
                {"bgm": "bgm-15-auction-noir", "layers": ["L1"], "when": {"dayMin": 5, "dayMax": 8}},
                {"bgm": "bgm-16-auction-pressure", "layers": ["L1"], "when": {"dayMin": 9}},
            ],
        },
        "scene-summary": {
            "bgm": "bgm-05-settlement", "layers": ["L1", "L2"],
            "variants": [
                {"bgm": "bgm-17-settlement-loss", "layers": ["L1", "L2"], "when": {"net": "negative"}},
            ],
        },
        "scene-ending": {"bgm": "bgm-18-ending-verdict"},
        "scene-final": {"bgm": "bgm-04-relic", "layers": ["L1"]},
        "scene-result": {
            "bgm": "bgm-19-result-success",
            "variants": [
                {"bgm": "bgm-20-result-bankruptcy", "when": {"endingNot": "relic"}},
            ],
        },
        "scene-museum": {"bgm": "bgm-21-museum-memory"},
    }


def main() -> None:
    sound = json.loads(SOUND_PATH.read_text(encoding="utf-8"))
    sound["schemaVersion"] = "sound-contract-2.0"
    sound["version"] = "6.4-sound-2.1-ledger-chamber"
    sound["generatedFor"] = "미지의 경매장 V6.4 장부 실내악 리디자인 HTML/Web"
    sound["bgm"] = build_bgm()
    sound["sceneBgmMap"] = build_scene_map()
    sound["musicProgram"] = {
        "principle": "경매의 저밀도 재즈만 유지하고, 나머지는 값의 간극·자금 배분·12일 마감·영구 유물을 표현하는 장부 실내악으로 통일한다. 숨은 값은 절대 음악으로 누설하지 않는다.",
        "selectionInputs": ["scene", "공개된 일차", "공개된 현재 호가/시작가 비율", "공개된 LOT 순서", "공개된 유물 라운드", "이미 공개된 결산 결과"],
        "forbiddenInputs": ["숨은 품질", "경쟁자 상한", "미공개 유물 가치", "미공개 시세 결과"],
        "continuity": "타이틀의 4음 장부 모티프를 도시·결산·결과·전시관에서 변형한다. 같은 씬의 변주는 진입 시 고정하며 입찰 도중에는 곡을 교체하지 않고 레이어만 페이드한다.",
        "retainedDirection": "일반 경매 3곡의 저밀도 재즈만 유지한다. 콘트라베이스·브러시·드문 저음 목관 킥이 중심이다.",
        "discardedDirection": ["영웅적 상인 모험곡", "관광지풍 항구 음악", "과도한 스팀펑크 공장 리듬", "유물 경매의 블록버스터 웅장함", "술집 재즈"],
        "leitmotif": "장부 모티프: 짧은 4음 질문형. 타이틀에서는 미해결, 도시에서는 반복, 결산에서는 분해, 성공 결과에서만 부분 해결, 전시관에서는 기억 조각으로 재등장.",
        "families": {
            "ledgerChamber": ["bgm-01-title", "bgm-02-city", "bgm-08-city-growth", "bgm-09-city-deadline", "bgm-05-settlement", "bgm-17-settlement-loss", "bgm-19-result-success"],
            "workAndInference": ["bgm-06-archive", "bgm-07-loading-workshop", "bgm-10-office-appraisal", "bgm-11-tavern-whispers", "bgm-12-exchange-ledger", "bgm-13-guild-vault", "bgm-14-merchant-workshop"],
            "auctionNoir": ["bgm-03-auction", "bgm-15-auction-noir", "bgm-16-auction-pressure"],
            "relicMemory": ["bgm-04-relic", "bgm-18-ending-verdict", "bgm-20-result-bankruptcy", "bgm-21-museum-memory"],
        },
    }

    existing = {item["id"]: item for item in sound["sfx"]}
    for item in new_cues():
        existing[item["id"]] = item
    sound["sfx"] = list(existing.values())
    for item in sound["sfx"]:
        override = SFX_RETONE.get(item["id"])
        if not override:
            continue
        item.update({key: value for key, value in override.items() if key != "prompt"})
        item["prompt"] = override["prompt"] + " " + STYLE

    sound["actionSfxMap"].update({
        "act-switch-office-tab": "sfx-page-turn",
        "act-accept-quest": "sfx-quest-select",
        "act-switch-exchange-tab": "sfx-page-turn",
        "act-sell-immediate": "sfx-sale-confirm",
        "act-take-loan": "sfx-loan-seal",
        "act-place-bid": "sfx-bid-place",
        "act-pass-lot": "sfx-pass",
        "act-run-tycoon-turn": "sfx-tycoon-bid",
        "act-pass-relic": "sfx-relic-pass",
        "act-next-relic-round": "sfx-relic-round-intro",
        "act-start-next-journey": "sfx-next-journey",
        "act-open-museum-from-campaign": "sfx-museum-unlock",
    })

    old_conditional = {item["cue"]: item for item in sound.get("conditionalCues", [])}
    additions = [
        {"cue": "sfx-ui-hover", "when": "모든 활성 버튼 첫 호버. 120ms 재트리거 방지"},
        {"cue": "sfx-market-rise", "when": "scene-city에서 공개된 오늘 시장 사건이 상승일 때"},
        {"cue": "sfx-market-fall", "when": "scene-city에서 공개된 오늘 시장 사건이 하락일 때"},
        {"cue": "sfx-deadline-warning", "when": "공개된 마감 전날 도시 진입 시 1회"},
        {"cue": "sfx-auction-countdown", "when": "화면에 표시된 경매 타이머 마지막 3초"},
        {"cue": "sfx-lot-win", "when": "popup-lot-result가 플레이어 낙찰을 공개한 뒤"},
        {"cue": "sfx-lot-lose", "when": "popup-lot-result가 경쟁자 낙찰 또는 유찰을 공개한 뒤"},
        {"cue": "sfx-summary-quest-success", "when": "결산 의뢰 성공 행이 나타날 때"},
        {"cue": "sfx-summary-quest-fail", "when": "결산 의뢰 실패 행이 나타날 때"},
        {"cue": "sfx-deadline-cleared", "when": "결산에서 공개된 승급 마감을 통과했을 때"},
        {"cue": "sfx-relic-lost", "when": "유물 라운드 결과가 경쟁자 낙찰로 공개된 뒤"},
        {"cue": "sfx-relic-display-set", "when": "새 영구 유물이 전시관에 처음 표시될 때"},
    ]
    for item in additions:
        old_conditional[item["cue"]] = item
    sound["conditionalCues"] = list(old_conditional.values())

    bgm_files = 0
    for item in sound["bgm"]:
        bgm_files += 1 if not item.get("layers") else len(item["layers"])
        if item.get("structure", {}).get("intro"):
            bgm_files += 1
    ambience_files = sum(1 for item in sound["sfx"] if item.get("loop"))
    sfx_files = len(sound["sfx"]) - ambience_files
    sound["files"]["expectedCount"] = {
        "bgmCompositions": len(sound["bgm"]),
        "bgmFiles": bgm_files,
        "sfxFiles": sfx_files,
        "ambienceFiles": ambience_files,
        "total": bgm_files + sfx_files + ambience_files,
    }
    sound.setdefault("generation", {})["bgm"] = {
        "recommended": "AI 초안 2~3테이크 → 인간 선택/편집 → 루프·라우드니스 마스터링",
        "promptSource": "각 bgm[].generationPrompt",
        "negative": MUSIC_NEGATIVE,
        "delivery": "44.1kHz stereo WAV master + OGG q6 web copy",
    }

    rendered = json.dumps(sound, ensure_ascii=False, indent=2) + "\n"
    SOUND_PATH.write_text(rendered, encoding="utf-8")
    RUNTIME_PATH.write_text("window.UNKNOWN_AUCTION_SOUND = " + rendered.rstrip() + ";\n", encoding="utf-8")
    print(json.dumps(sound["files"]["expectedCount"], ensure_ascii=False))


if __name__ == "__main__":
    main()

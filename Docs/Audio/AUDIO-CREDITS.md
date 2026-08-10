# 오디오 출처 및 배포 확인

기준: `미지의경매장 V6.4 sound 3.4`

> 타이틀곡 `Blue Harbor Ledger`는 팀이 AI로 생성한 곡이다(아래 참조). 나머지 6곡은 제공 패키지의 연결 후보이며, 팀이 최종 음원을 확정하기 전에는 제출 문서에서 "최종 선정" 또는 "사용자 승인"으로 표현하지 않는다.

## 공개 전에 확인할 항목

- ~~`Blue Harbor Ledger`는 패키지에 포함된 파일이지만 사용자가 직접 선정한 곡은 아니다. 공개·판매·게임 내 재배포 권리와 팀 사용 승인을 모두 확인해야 한다.~~
  **해소됐다 (2026-08-08).** 이 곡은 **팀이 OpenMusic AI(https://www.openmusic.ai)로 생성한 AI 음악**이다. 제공 패키지에서 온 것이 아니다.
  약관상 생성물의 권리는 생성한 사용자에게 귀속되고, 로열티 프리로 게시·배포·수익화·수정이 가능하며 출처 표기 의무가 없다. 서비스는 기반 모델·인프라에 대한 권리만 가진다.
  **다만 "AI 생성 에셋" 표시는 필요하다** — 제출 체크리스트의 필수 항목이라 `02-AI활용기술.md`의 에셋 표에 AI 생성으로 명시했다.
  약관은 생성물이 관련 법률을 지키고 제3자 권리를 침해하지 않을 책임을 사용자에게 둔다.
- 아래 Kevin MacLeod 6곡은 Creative Commons Attribution 4.0 조건으로 사용한다.
- 편집 음원을 독립 음악 상품으로 재판매하지 않는다.

## 필수 크레딧

```text
"Thatched Villagers", "March of the Spoons", "Midnight Tale", "I Knew a Guy",
"Court of the Queen", and "Peaceful Desolation" by Kevin MacLeod
(https://incompetech.com) are licensed under Creative Commons Attribution 4.0:
https://creativecommons.org/licenses/by/4.0/

Edited for in-game looping, duration, and level matching.
```

## 런타임 연결

- 타이틀: `Blue Harbor Ledger`
- 도시: `Thatched Villagers`
- 의뢰소·거래소·상회·조합: `March of the Spoons` 계열
- 술집: `Midnight Tale`
- 일반 경매: `I Knew a Guy`
- 유물 경매: `Court of the Queen`
- 결산·결과·박물관: `Peaceful Desolation`

실제 파일은 `Runtime/assets/audio/`에 있으며, 런타임 매핑은 `Runtime/data/audio-map.json`을 기준으로 한다.

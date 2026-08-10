# AI용 경매품 이미지 구조

이 폴더는 `계열 → 개별 품목 → 등급 → PNG` 순서로 구성되어 있다.

예시:

```text
01_CER_도자기/
  01_BASE-CER-01_청화_약탕기/
    item.json
    01_COMMON_일반/BASE-CER-01_COMMON.png
    02_RARE_레어/BASE-CER-01_RARE.png
    03_EPIC_에픽/BASE-CER-01_EPIC.png
    04_LEGENDARY_전설/BASE-CER-01_LEGENDARY.png
```

- 모든 PNG는 128×128 투명 RGBA 이미지다.
- `catalog.json`은 전체 60개 품목과 240개 이미지 경로를 계층적으로 설명한다.
- `catalog.csv`는 이미지 1개당 한 행으로 정리되어 있다.
- 각 품목의 `item.json`에는 해당 품목의 네 등급 경로가 들어 있다.

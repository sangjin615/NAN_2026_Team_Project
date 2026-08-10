#!/usr/bin/env python3
"""SFX 생성 프롬프트를 sound.json의 각 큐에 주입한다.

프롬프트도 sound.json이 소유한다. 여기는 주입 도구일 뿐이며,
프롬프트를 고칠 때는 이 파일의 PROMPTS를 고치고 다시 실행한다.
    python inject-prompts.py
"""
import json
import pathlib

HERE = pathlib.Path(__file__).parent

# 모든 프롬프트 뒤에 붙는 공통 톤 앵커.
# 이걸 빼면 개별 소리는 그럴듯해도 110개 큐가 한 게임처럼 들리지 않는다.
STYLE = (
    " Recorded close-mic in a small wood-panelled antique shop. Warm analog "
    "tape character, narrow stereo, no digital sheen, gentle rolloff above "
    "12kHz. Aged brass and worn wood timbre. Dry, short room tail. No music, "
    "no synth, no cartoon exaggeration."
)

PROMPTS = {
    # --- 공용 UI ---
    "sfx-ui-hover": "A barely audible whisper of dust brushing across an old glass surface. Extremely soft and short.",
    "sfx-ui-click": "A small brass toggle switch flipping with a crisp mechanical click.",
    "sfx-ui-back": "A single soft knock on hollow aged wood, low and rounded.",
    "sfx-ui-tab": "A small wooden drawer sliding a short distance on its rail and stopping.",
    "sfx-ui-disabled": "A metal latch catching and refusing to move. Dull, blocked, no resonance.",
    "sfx-popup-open": "The lid of a glass display cabinet lifting, with a soft hiss of escaping air.",
    "sfx-popup-close": "A glass cabinet lid settling closed onto its felt seal. Low contact thud.",
    "sfx-modal-confirm": "A brass seal stamp pressing firmly into warm wax. Single deliberate press.",
    "sfx-modal-cancel": "A single sheet of aged paper being folded once.",
    "sfx-toast": "A small brass service bell struck once, with a short clean decay.",
    "sfx-failure": "A clockwork gear catching on a broken tooth and slipping, grinding briefly.",
    "sfx-coin-gain": "A handful of old gold coins spilling onto a wooden counter and settling.",
    "sfx-coin-spend": "A small stack of coins pushed across a wooden counter.",
    "sfx-scene-in": "A heavy wooden door opening, followed by a shift in the room's air.",
    "sfx-save": "A thick leather ledger closing, followed by a brass clasp locking shut.",
    "sfx-settings-tick": "A single detent notch of a metal dial turning one step.",
    # --- 진입·저장 ---
    "sfx-title-logo": "A large clockwork mainspring being wound three full turns, ending with one low resonant bell.",
    "sfx-new-run": "A match striking and catching, then an oil lamp wick igniting into a steady flame.",
    "sfx-slot-select": "A fingertip tapping a stiff card index tab once.",
    "sfx-slot-delete": "A sheet of aged paper being torn cleanly in half.",
    "sfx-load-complete": "A ledger opening and a brass clasp releasing, papers settling.",
    # --- 여정 생성 ---
    "amb-loading-gears": "A steady loop of clockwork machinery turning: interlocking brass gears, escapement ticks, faint spring tension. Seamless loop, no beginning or end.",
    "sfx-loading-done": "Clockwork machinery slowing to a stop, followed by a single soft bell.",
    # --- 도시·거점 ---
    "sfx-venue-enter": "A wooden shop door swinging open with a soft creak, air from the room beyond drifting in.",
    "sfx-day-advance": "A clockwork key winding one full deliberate turn, spring tension increasing, ending with a firm ratchet click.",
    "amb-deadline-tick": "A quiet loop of an old clock's second hand ticking steadily. Distant, soft, patient. Seamless loop.",
    "sfx-market-event": "A sheet of paper being pinned onto a wooden notice board.",
    # --- 의뢰소 ---
    "sfx-quest-accept": "A rubber stamp pressed onto a document, then the page turning.",
    "sfx-appraise-start": "A magnifying glass lens being lowered onto glass and rubbed slowly across the surface.",
    "sfx-appraise-reveal": "A magnifying glass set down onto a wooden desk, followed by a short quiet breath.",
    # --- 술집 ---
    "sfx-info-buy": "Coins passed quietly across a table, with a low indistinct whisper underneath.",
    "sfx-info-reveal": "A folded sheet of paper being opened out flat.",
    # --- 거래소 ---
    "sfx-sell": "Abacus beads flicked across their rods, followed by coins swept together.",
    "sfx-hanbo-complete": "Several cut glass pieces sliding into place and locking together with a satisfying seat, followed by three clear rising chime tones.",
    "sfx-settlement-open": "A heavy leather ledger set down onto a wooden table with weight.",
    # --- 조합 ---
    "sfx-loan-take": "A heavy iron safe door swinging open, followed by a thick chain being unwound.",
    "sfx-loan-repay": "A chain being drawn away and a latch releasing open.",
    "sfx-loan-overdue": "One low ominous bell, followed by a heavy padlock snapping shut.",
    # --- 상회 ---
    "sfx-upgrade": "A brass nameplate being fixed to a wooden wall with two taps, followed by a rising three-note chime.",
    # --- 경매 ---
    "sfx-bid-place": "A wooden auction paddle raised quickly, with a light wooden tap.",
    "sfx-bid-bot": "A wooden auction paddle raised at a distance across a room. Duller and further away.",
    "sfx-outbid": "Two low double bass notes rising a semitone, tense and short.",
    "sfx-pass": "A wooden chair creaking as someone leans back, and a paddle set down on a table.",
    "sfx-gavel": "A wooden auction gavel struck three times on its block, the final strike ringing into a small hall reverb.",
    "sfx-lot-next": "A cloth cover being drawn off an object and a wooden display turntable rotating.",
    "amb-auction-crowd": "A quiet loop of a seated indoor crowd murmuring in a wood-panelled hall. Words must remain unintelligible. Occasional paper rustle and chair creak. Seamless loop.",
    # --- 결산 ---
    "sfx-summary-open": "A thick ledger book opening flat, pages settling.",
    "sfx-ledger-line": "A fountain pen drawing one short quick line across paper.",
    "sfx-profit": "Coins sliding to one side of a brass balance scale, the pan tipping and settling with a soft ring.",
    "sfx-loss": "A brass balance scale tipping the opposite way with a low reluctant creak.",
    # --- 유물 경매 ---
    "sfx-relic-reveal": "A heavy cloth cover pulled away from a large object, followed by a deep resonant hum spreading through a hall.",
    "sfx-relic-bid": "A heavy wooden paddle raised in a large stone hall, with long reverb.",
    "sfx-relic-gavel": "A large gavel struck three times in a vast stone hall, the final strike ringing out with long reverberation.",
    "sfx-relic-acquire": "A wax seal pressed closed, followed by a low wordless choir swelling once and fading.",
    # --- 결과·메타 ---
    "sfx-result-success": "A clockwork spring wound fully to its stop, then three resonant bells ringing in sequence.",
    "sfx-result-bankruptcy": "A clockwork mechanism slowly unwinding and grinding to a halt, ending with a mainspring going slack.",
    "sfx-campaign-complete": "Multiple large clockwork gears engaging one after another and beginning to turn together in unison.",
    "sfx-museum-inspect": "A hand touching the glass of a display case, with a soft glass contact tone.",
}


def main():
    path = HERE / "sound.json"
    data = json.loads(path.read_text(encoding="utf-8"))

    missing = []
    for cue in data["sfx"]:
        text = PROMPTS.get(cue["id"])
        if not text:
            missing.append(cue["id"])
            continue
        cue["prompt"] = text.rstrip() + STYLE

    extra = sorted(set(PROMPTS) - {c["id"] for c in data["sfx"]})

    data.setdefault("generation", {})["sfx"] = {
        "service": "ElevenLabs Sound Effects API (fallback: Stable Audio)",
        "styleAnchor": STYLE.strip(),
        "note": "프롬프트는 inject-prompts.py의 PROMPTS가 소유한다. 고친 뒤 다시 실행해 주입한다.",
    }

    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("injected: %d / %d" % (len(data["sfx"]) - len(missing), len(data["sfx"])))
    if missing:
        print("MISSING prompt for: %s" % ", ".join(missing))
    if extra:
        print("UNUSED prompt keys: %s" % ", ".join(extra))


if __name__ == "__main__":
    main()

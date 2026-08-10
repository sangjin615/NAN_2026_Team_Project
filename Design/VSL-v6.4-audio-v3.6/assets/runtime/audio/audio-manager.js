(function () {
  "use strict";

  const config = window.UNKNOWN_AUCTION_SOUND || {};
  const cueById = new Map((config.sfx || []).map((cue) => [cue.id, cue]));
  const bgmById = new Map((config.bgm || []).map((bgm) => [bgm.id, bgm]));
  const sceneMap = config.sceneBgmMap || {};
  const sceneAmbienceMap = config.sceneAmbienceMap || {};
  const actionMap = config.actionSfxMap || {};
  const root = "assets/runtime/audio/";
  const soundRevision = encodeURIComponent(config.version || "sound");

  let unlocked = false;
  let currentBgmId = null;
  let currentSceneId = null;
  let currentResolvedMapping = null;
  let currentTracks = new Map();
  let ambienceTracks = new Map();
  let lastModalType = null;
  let bgmDuckGain = 1;
  let bgmDuckToken = 0;
  const activeCues = new Map();
  const volumes = { master: 0.8, bgm: 0.65, sfx: 0.85 };

  function clamp(value, low = 0, high = 1) {
    return Math.max(low, Math.min(high, Number(value) || 0));
  }

  function dbToGain(db) {
    return Math.pow(10, Number(db || 0) / 20);
  }

  function busGain(bus) {
    return volumes.master * (bus === "bgm" || bus === "ambience" ? volumes.bgm : volumes.sfx);
  }

  function updateTrackVolume(track) {
    track.audio.volume = clamp(track.baseGain * busGain("bgm") * track.fade * bgmDuckGain);
  }

  function setVolumes(next) {
    for (const key of Object.keys(volumes)) {
      if (next && next[key] != null) volumes[key] = clamp(next[key]);
    }
    for (const track of currentTracks.values()) {
      updateTrackVolume(track);
    }
    for (const item of ambienceTracks.values()) {
      item.audio.volume = clamp(item.baseGain * busGain("ambience"));
    }
  }

  function makeAudio(path, loop) {
    const audio = new Audio(path);
    audio.preload = "auto";
    audio.loop = !!loop;
    return audio;
  }

  function publishSoundState(mapping = currentResolvedMapping) {
    const rootElement = document.documentElement;
    rootElement.dataset.soundScene = currentSceneId || "";
    rootElement.dataset.soundBgm = mapping?.bgm || currentBgmId || "";
    rootElement.dataset.soundRevision = config.version || "";
    rootElement.dataset.soundUnlocked = String(unlocked);
  }

  function safePlay(audio) {
    if (!unlocked) return;
    const promise = audio.play();
    if (promise && promise.catch) promise.catch((error) => {
      document.documentElement.dataset.soundError = error?.name || "playback-error";
    });
  }

  function rampBgmDuck(target, seconds, token, done) {
    const started = performance.now();
    const from = bgmDuckGain;
    const duration = Math.max(0.02, Number(seconds) || 0.02) * 1000;
    function frame(now) {
      if (token !== bgmDuckToken) return;
      const progress = clamp((now - started) / duration);
      bgmDuckGain = from + (target - from) * Math.sin((progress * Math.PI) / 2);
      for (const track of currentTracks.values()) updateTrackVolume(track);
      if (progress < 1) requestAnimationFrame(frame);
      else if (done) done();
    }
    requestAnimationFrame(frame);
  }

  function duckBgmForCue(id) {
    const rule = (config.mixRules?.ducking || []).find((item) => item.trigger === id);
    if (!rule || !currentTracks.size) return;
    const token = ++bgmDuckToken;
    const target = dbToGain(rule.amount);
    rampBgmDuck(target, rule.attack, token, () => {
      setTimeout(() => {
        if (token !== bgmDuckToken) return;
        rampBgmDuck(1, rule.release, token);
      }, Math.max(0, Number(rule.hold) || 0) * 1000);
    });
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    publishSoundState();
    if (currentSceneId) setScene(currentSceneId, window.state || null, true);
  }

  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });

  document.addEventListener("pointerover", (event) => {
    const button = event.target.closest?.("button");
    if (!button || button.contains(event.relatedTarget)) return;
    playCue(button.disabled ? "sfx-ui-disabled" : "sfx-ui-hover");
  }, true);

  document.addEventListener("input", (event) => {
    if (event.target.matches?.('input[type="range"]')) playCue("sfx-settings-tick", { gain: 0.65 });
    if (event.target.matches?.('input[type="number"]')) playCue("sfx-ui-number-step", { gain: 0.75 });
  }, true);

  function cuePath(cue) {
    const folder = cue.loop ? "ambience" : "sfx";
    return `${root}${folder}/${cue.id}.wav?soundRev=${soundRevision}`;
  }

  function playCue(id, options = {}) {
    const cue = cueById.get(id);
    if (!cue || !unlocked) return null;
    const limit = Number(cue.polyphony || config.mixRules?.polyphony?.default || 3);
    const list = activeCues.get(id) || [];
    while (list.length >= limit) {
      const oldest = list.shift();
      oldest.pause();
    }
    const audio = makeAudio(cuePath(cue), !!cue.loop);
    audio.volume = clamp(dbToGain(cue.gain) * busGain(cue.loop ? "ambience" : "sfx") * (options.gain || 1));
    audio.playbackRate = options.playbackRate || 1;
    list.push(audio);
    activeCues.set(id, list);
    audio.addEventListener("ended", () => {
      const index = list.indexOf(audio);
      if (index >= 0) list.splice(index, 1);
    });
    duckBgmForCue(id);
    safePlay(audio);
    return audio;
  }

  function fadeTrack(track, target, seconds, stopAfter) {
    const started = performance.now();
    const from = track.fade;
    const duration = Math.max(0.05, seconds || 0.05) * 1000;
    function frame(now) {
      const progress = clamp((now - started) / duration);
      track.fade = from + (target - from) * Math.sin((progress * Math.PI) / 2);
      updateTrackVolume(track);
      if (progress < 1) requestAnimationFrame(frame);
      else if (stopAfter) {
        track.audio.pause();
        track.audio.currentTime = 0;
      }
    }
    requestAnimationFrame(frame);
  }

  function bgmFile(id, layer) {
    return `${root}bgm/${id}__${layer || "loop"}.wav?soundRev=${soundRevision}`;
  }

  function matchesVariant(when, context) {
    if (!when) return true;
    const day = Number(context?.day || 1);
    if (when.dayMin != null && day < Number(when.dayMin)) return false;
    if (when.dayMax != null && day > Number(when.dayMax)) return false;
    if (when.net) {
      const net = Number(context?.daily?.income || 0) - Number(context?.daily?.expense || 0);
      if (when.net === "negative" && net >= 0) return false;
      if (when.net === "nonNegative" && net < 0) return false;
    }
    if (when.endingType && context?.ending?.type !== when.endingType) return false;
    if (when.endingNot && context?.ending?.type === when.endingNot) return false;
    return true;
  }

  function resolveSceneMapping(sceneId, context) {
    const base = sceneMap[sceneId];
    if (!base) return null;
    const variant = (base.variants || []).find((item) => matchesVariant(item.when, context));
    return variant ? { ...base, ...variant, variants: base.variants } : base;
  }

  function desiredLayers(mapping, context) {
    let layers = mapping.layers ? [...mapping.layers] : ["loop"];
    const bgm = bgmById.get(mapping.bgm);
    if (bgm?.adaptiveRole === "auction" && context?.daily?.auction?.current) {
      const current = context.daily.auction.current;
      const lot = context.daily.lots?.[context.daily.lotIndex];
      if (current.currentBid > (lot?.startingPrice || Infinity) * 2 && !layers.includes("L2")) layers.push("L2");
      // 공개 정보만 사용한다. 숨은 품질/경쟁자 상한으로 음악을 바꾸지 않는다.
      if (context.daily.lotIndex === 7 && !layers.includes("L3")) layers.push("L3");
    }
    if (bgm?.adaptiveRole === "relic" && context?.finalAuction) {
      const round = context.finalAuction.round || 0;
      layers = ["L1"];
      if (round >= 1) layers.push("L2");
      if (round >= 2) layers.push("L3");
    }
    return layers;
  }

  function syncLayers(mapping, context, forceStart) {
    const desired = new Set(desiredLayers(mapping, context));
    const bgm = bgmById.get(mapping.bgm);
    const known = bgm?.layers?.map((layer) => layer.id) || ["loop"];
    for (const layer of known) {
      let track = currentTracks.get(layer);
      if (!track) {
        const audio = makeAudio(bgmFile(mapping.bgm, layer), true);
        track = { audio, fade: 0, baseGain: 1 };
        currentTracks.set(layer, track);
        if (forceStart || unlocked) safePlay(audio);
      }
      fadeTrack(track, desired.has(layer) ? 1 : 0, 1.2, false);
    }
  }

  function stopCurrent(seconds) {
    for (const track of currentTracks.values()) fadeTrack(track, 0, seconds, true);
    currentTracks = new Map();
  }

  function desiredAmbience(sceneId, context) {
    const ids = sceneAmbienceMap[sceneId] ? [sceneAmbienceMap[sceneId]] : [];
    if (["scene-city", "scene-office", "scene-tavern", "scene-exchange", "scene-guild", "scene-merchant"].includes(sceneId)
        && [3, 6, 9].includes(Number(context?.day))) ids.push("amb-deadline-tick");
    return ids;
  }

  function updateAmbience(sceneId, context) {
    const desired = new Set(desiredAmbience(sceneId, context));
    for (const [id, item] of ambienceTracks) {
      if (desired.has(id)) continue;
      item.audio.pause();
      ambienceTracks.delete(id);
    }
    if (!unlocked) return;
    for (const id of desired) {
      if (ambienceTracks.has(id)) continue;
      const cue = cueById.get(id);
      if (!cue) continue;
      const audio = makeAudio(cuePath(cue), true);
      const baseGain = dbToGain(cue.gain);
      audio.volume = clamp(baseGain * busGain("ambience"));
      ambienceTracks.set(id, { audio, baseGain });
      safePlay(audio);
    }
  }

  function setScene(sceneId, context, forceStart = false) {
    const previousScene = currentSceneId;
    currentSceneId = sceneId;
    const mapping = resolveSceneMapping(sceneId, context);
    currentResolvedMapping = mapping;
    publishSoundState(mapping);
    if (!mapping) return;
    if (unlocked && previousScene !== sceneId) {
      if (sceneId === "scene-city" && context?.daily?.event) {
        playCue(Number(context.daily.event.delta) >= 0 ? "sfx-market-rise" : "sfx-market-fall");
        if ([3, 6, 9].includes(Number(context?.day))) {
          setTimeout(() => playCue("sfx-deadline-warning"), 350);
        }
      } else if (sceneId === "scene-summary") {
        const net = Number(context?.daily?.income || 0) - Number(context?.daily?.expense || 0);
        playCue(net >= 0 ? "sfx-profit" : "sfx-loss");
        (context?.daily?.questResults || []).slice(0, 4).forEach((result, index) => {
          setTimeout(() => playCue(result.ok ? "sfx-summary-quest-success" : "sfx-summary-quest-fail"), 300 + index * 180);
        });
      } else if (sceneId === "scene-result") {
        playCue(context?.ending?.type === "bankruptcy" ? "sfx-result-bankruptcy" : "sfx-result-success");
      } else if (sceneId === "scene-final") {
        playCue("sfx-relic-reveal");
      }
    }
    updateAmbience(sceneId, context);
    if (currentBgmId === mapping.bgm) {
      publishSoundState(mapping);
      syncLayers(mapping, context, forceStart);
      return;
    }
    stopCurrent(sceneId === "scene-result" && context?.ending ? 0.6 : 1.8);
    currentBgmId = mapping.bgm;
    publishSoundState(mapping);
    syncLayers(mapping, context, forceStart);
  }

  function playAction(actionId) {
    const cue = actionMap[actionId];
    if (cue) playCue(cue);
  }

  function onModal(type) {
    if (type === lastModalType) return;
    if (!type && lastModalType) playCue("sfx-popup-close");
    else if (type && !["hanboResult", "lotResult", "finalResult"].includes(type)) playCue("sfx-popup-open");
    lastModalType = type || null;
  }

  function onToast(isFailure) {
    playCue(isFailure ? "sfx-failure" : "sfx-toast");
  }

  function bindGame(game) {
    const methods = {
      newRun: "act-start-new-run", openContinue: "act-open-continue", loadSlot: "act-load-save",
      backTitle: "act-return-title-from-campaign", openSettings: "act-open-settings", saveCurrent: "act-save-game",
      openMuseumFromTitle: "act-enter-museum", openMuseumResult: "act-enter-museum", openInventory: "act-enter-merchant",
      goCity: "act-return-city", acceptQuest: "act-accept-quest", appraise: "act-appraise-lot",
      renderOffice: "act-switch-office-tab", renderExchange: "act-switch-exchange-tab",
      buyInfo: "act-buy-market-forecast", sellItem: "act-sell-immediate", sellHanbo: "act-form-hanbo",
      takeLoan: "act-take-loan", repayLoan: "act-repay-loan", upgradeShop: "act-upgrade-shop",
      placeBid: "act-place-bid", passLot: "act-pass-lot", nextLot: "act-next-lot",
      nextDay: "act-next-day", openSettlement: "act-open-day12-settlement",
      finishSettlement: "act-finish-settlement", startFinalAuction: "act-start-relic-auction",
      placeFinalBid: "act-place-relic-bid", passFinal: "act-pass-relic", nextFinalRound: "act-next-relic-round",
      newJourney: "act-start-next-journey"
    };
    for (const [method, actionId] of Object.entries(methods)) {
      if (typeof game[method] !== "function") continue;
      const original = game[method];
      game[method] = function (...args) {
        playAction(actionId);
        return original.apply(this, args);
      };
    }

    // Location buttons share one game method, but each action remains explicit
    // in sound.json/VSL. Bind it separately so runtime and editor never drift.
    if (typeof game.enterLocation === "function") {
      const enterLocation = game.enterLocation;
      const locationActions = {
        office: "act-enter-office", tavern: "act-enter-tavern", exchange: "act-enter-exchange",
        guild: "act-enter-guild", merchant: "act-enter-merchant", auction: "act-enter-auction",
        museum: "act-enter-museum"
      };
      game.enterLocation = function (id, ...args) {
        const actionId = locationActions[id];
        if (actionId) playAction(actionId);
        return enterLocation.call(this, id, ...args);
      };
    }
  }

  window.Sound = {
    bindGame,
    onModal,
    onToast,
    playAction,
    playCue,
    setScene,
    setVolumes,
    unlock,
    get state() {
      return {
        unlocked,
        currentBgmId,
        currentSceneId,
        resolvedMapping: currentResolvedMapping ? { ...currentResolvedMapping } : null,
        soundRevision: config.version || null,
        ambienceIds: [...ambienceTracks.keys()],
        volumes: { ...volumes }
      };
    }
  };
})();

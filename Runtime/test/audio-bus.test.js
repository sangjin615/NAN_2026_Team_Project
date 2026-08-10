import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioBus } from '../src/audio-bus.js';

class DelayedAudio {
  static instances = [];

  constructor(file) {
    this.file = file;
    this.dataset = {};
    this.paused = true;
    this.muted = false;
    this.currentTime = 0;
    this.resolvePlay = null;
    DelayedAudio.instances.push(this);
  }

  play() {
    this.paused = false;
    return new Promise((resolve) => { this.resolvePlay = resolve; });
  }

  pause() { this.paused = true; }
}

test('muting cancels a delayed BGM play and keeps it stopped', async () => {
  const OriginalAudio = globalThis.Audio;
  globalThis.Audio = DelayedAudio;
  try {
    const bus = new AudioBus();
    bus.map = { masterVolume: 0.8, bgm: { title: { file: 'title.wav', loop: true } }, sfx: {} };
    assert.equal(bus.playBgm('title'), true);
    const pending = DelayedAudio.instances.at(-1);
    bus.setEnabled(false);
    pending.resolvePlay();
    await Promise.resolve();
    assert.equal(bus.enabled, false);
    assert.equal(pending.muted, true);
    assert.equal(pending.paused, true);
    assert.equal(bus.currentBgm, null);
  } finally {
    globalThis.Audio = OriginalAudio;
    DelayedAudio.instances.length = 0;
  }
});

test('muting also stops SFX that are already in flight', async () => {
  const OriginalAudio = globalThis.Audio;
  globalThis.Audio = DelayedAudio;
  try {
    const bus = new AudioBus();
    bus.map = { masterVolume: 0.8, bgm: {}, sfx: { navigate: { file: 'navigate.wav' } } };
    assert.equal(bus.playSfx('navigate'), true);
    const pending = DelayedAudio.instances.at(-1);
    bus.setEnabled(false);
    pending.resolvePlay();
    await Promise.resolve();
    assert.equal(pending.muted, true);
    assert.equal(pending.paused, true);
    assert.equal(bus.activeSfx.size, 0);
  } finally {
    globalThis.Audio = OriginalAudio;
    DelayedAudio.instances.length = 0;
  }
});

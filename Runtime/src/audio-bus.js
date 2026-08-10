export class AudioBus {
  constructor() {
    this.map = { bgm: {}, sfx: {} };
    this.currentBgm = null;
    this.requestedBgm = null;
    this.activeSfx = new Set();
    this.playbackVersion = 0;
    this.enabled = true;
  }

  async load(url = './data/audio-map.json') {
    const response = await fetch(url);
    if (response.ok) this.map = await response.json();
    return this;
  }

  playSfx(id) {
    const entry = this.map.sfx[id];
    if (!this.enabled || !entry) return false;
    const audio = new Audio(entry.file);
    audio.volume = entry.volume ?? this.map.masterVolume ?? 0.8;
    this.activeSfx.add(audio);
    audio.onended = () => this.activeSfx.delete(audio);
    audio.play().then(() => {
      if (!this.enabled || !this.activeSfx.has(audio)) {
        audio.muted = true;
        audio.pause();
      }
    }).catch(() => this.activeSfx.delete(audio));
    return true;
  }

  playBgm(id) {
    this.requestedBgm = id;
    const entry = this.map.bgm[id];
    if (!this.enabled || !entry || (this.currentBgm?.dataset.id === id && !this.currentBgm.paused)) return false;
    const version = ++this.playbackVersion;
    if (this.currentBgm) {
      this.currentBgm.muted = true;
      this.currentBgm.pause();
    }
    const audio = new Audio(entry.file);
    audio.dataset.id = id;
    audio.loop = entry.loop ?? true;
    audio.volume = entry.volume ?? this.map.masterVolume ?? 0.8;
    this.currentBgm = audio;
    audio.play().then(() => {
      if (!this.enabled || version !== this.playbackVersion || this.currentBgm !== audio) {
        audio.muted = true;
        audio.pause();
      }
    }).catch(() => {});
    return true;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.stop(false);
      this.activeSfx.forEach((audio) => {
        audio.muted = true;
        audio.pause();
      });
      this.activeSfx.clear();
    } else if (this.requestedBgm) {
      this.playBgm(this.requestedBgm);
    }
    return this.enabled;
  }

  stop(clearRequest = true) {
    this.playbackVersion += 1;
    if (this.currentBgm) {
      this.currentBgm.muted = true;
      this.currentBgm.pause();
      try { this.currentBgm.currentTime = 0; } catch {}
    }
    this.currentBgm = null;
    if (clearRequest) this.requestedBgm = null;
  }
}

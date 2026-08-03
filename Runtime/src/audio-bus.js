export class AudioBus {
  constructor() { this.map = { bgm: {}, sfx: {} }; this.currentBgm = null; this.requestedBgm = null; this.enabled = true; }
  async load(url = './data/audio-map.json') { const response = await fetch(url); if (response.ok) this.map = await response.json(); return this; }
  playSfx(id) { if (!this.enabled || !this.map.sfx[id]) return false; const audio = new Audio(this.map.sfx[id].file); audio.volume = this.map.sfx[id].volume ?? this.map.masterVolume ?? 0.8; audio.play().catch(() => {}); return true; }
  playBgm(id) { this.requestedBgm = id; const entry = this.map.bgm[id]; if (!this.enabled || !entry || this.currentBgm?.dataset.id === id) return false; this.currentBgm?.pause(); const audio = new Audio(entry.file); audio.dataset.id = id; audio.loop = entry.loop ?? true; audio.volume = entry.volume ?? this.map.masterVolume ?? 0.8; audio.play().catch(() => {}); this.currentBgm = audio; return true; }
  setEnabled(enabled) { this.enabled = Boolean(enabled); if (!this.enabled) this.stop(false); else if (this.requestedBgm) this.playBgm(this.requestedBgm); return this.enabled; }
  stop(clearRequest = true) { this.currentBgm?.pause(); this.currentBgm = null; if (clearRequest) this.requestedBgm = null; }
}

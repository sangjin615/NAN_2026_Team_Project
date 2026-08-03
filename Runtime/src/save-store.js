const SAVE_KEY = 'unknown-auction:vsl-runtime:save:v1';

export class SaveStore {
  constructor(storage = globalThis.localStorage) { this.storage = storage; }
  save(state) { this.storage?.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), state })); }
  load() {
    const raw = this.storage?.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.version === 1 ? parsed.state : null;
  }
  clear() { this.storage?.removeItem(SAVE_KEY); }
}

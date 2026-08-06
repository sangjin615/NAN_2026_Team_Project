import { RELIC_AUCTION_DAY } from './constants.js';

const LEGACY_SAVE_KEY = 'unknown-auction:vsl-runtime:save:v1';
const SAVE_PREFIX = 'unknown-auction:vsl-runtime:save:v2';

function isState(value) {
  return Boolean(value && typeof value === 'object' && value.schedule && Number.isInteger(value.day) && value.day >= 1 && value.day <= RELIC_AUCTION_DAY);
}

function parse(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value?.version === 2 && isState(value.state) ? value : null;
  } catch {
    return null;
  }
}

function migrateState(state) {
  for (const lot of state.schedule?.days?.flatMap((day) => day.lots || []) || []) {
    lot.pricing ??= {};
    lot.pricing.catalogBasePrice ??= lot.pricing.basePrice;
    lot.pricing.priceMultiplier ??= 1;
  }
  for (const item of state.inventory || []) item.catalogBasePrice ??= item.basePrice;
  if (state.loan && state.loan.earlyRepayment == null) state.loan.earlyRepayment = Math.round(state.loan.principal * 1.05 / 10) * 10;
  return state;
}

export class SaveStore {
  constructor(storage = globalThis.localStorage) { this.storage = storage; }

  key(slot, kind) { return `${SAVE_PREFIX}:slot:${slot}:${kind}`; }

  save(state, slot = state?.saveSlot || 1) {
    if (!this.storage || !isState(state) || slot < 1 || slot > 3) return false;
    state.saveSlot = slot;
    const packet = JSON.stringify({ version: 2, savedAt: new Date().toISOString(), state });
    const tempKey = this.key(slot, 'temp');
    const currentKey = this.key(slot, 'current');
    const backupKey = this.key(slot, 'backup');
    this.storage.setItem(tempKey, packet);
    if (!parse(this.storage.getItem(tempKey))) { this.storage.removeItem(tempKey); return false; }
    const current = this.storage.getItem(currentKey);
    if (parse(current)) this.storage.setItem(backupKey, current);
    this.storage.setItem(currentKey, packet);
    this.storage.removeItem(tempKey);
    return true;
  }

  load(slot = 1) {
    if (!this.storage) return null;
    for (const kind of ['current', 'backup']) {
      const packet = parse(this.storage.getItem(this.key(slot, kind)));
      if (packet) {
        packet.state.saveSlot = slot;
        if (kind === 'backup') this.storage.setItem(this.key(slot, 'current'), JSON.stringify(packet));
        return migrateState(packet.state);
      }
    }
    if (slot === 1) return this.migrateLegacy();
    return null;
  }

  migrateLegacy() {
    try {
      const legacy = JSON.parse(this.storage?.getItem(LEGACY_SAVE_KEY) || 'null');
      if (legacy?.version !== 1 || !isState(legacy.state)) return null;
      legacy.state.saveSlot = 1;
      this.save(legacy.state, 1);
      this.storage.removeItem(LEGACY_SAVE_KEY);
      return migrateState(legacy.state);
    } catch {
      return null;
    }
  }

  list() {
    return [1, 2, 3].map((slot) => {
      const packet = parse(this.storage?.getItem(this.key(slot, 'current')));
      const state = packet?.state;
      return {
        slot,
        empty: !state,
        day: state?.day || null,
        cash: state?.cash || null,
        shopStage: state?.shopStage || null,
        savedAt: packet?.savedAt || null,
      };
    });
  }

  clear(slot = 1) {
    for (const kind of ['current', 'backup', 'temp']) this.storage?.removeItem(this.key(slot, kind));
    if (slot === 1) this.storage?.removeItem(LEGACY_SAVE_KEY);
  }
}

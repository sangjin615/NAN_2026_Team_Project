export function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ next >>> 15, next | 1);
    next ^= next + Math.imul(next ^ next >>> 7, next | 61);
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}

export function shuffle(values, rng) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function weightedChoice(entries, rng) {
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, Number(weight) || 0), 0);
  let cursor = rng() * total;
  for (const [value, weight] of entries) {
    cursor -= Math.max(0, Number(weight) || 0);
    if (cursor <= 0) return value;
  }
  return entries.at(-1)?.[0];
}

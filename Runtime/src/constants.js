export const RUN_DAYS = 12;
export const RELIC_AUCTION_DAY = RUN_DAYS + 1;
export const JOURNEY_DAYS = RELIC_AUCTION_DAY;
export const LOTS_PER_DAY = 8;
export const BUFFER_AHEAD_DAYS = 2;
export const GRADES = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
export const DEFAULT_GRADE_WEIGHTS = { COMMON: 55, RARE: 28, EPIC: 13, LEGENDARY: 4 };

export const VISUAL_EFFECTS = Object.freeze([
  'display-shadow', 'rim-glow', 'soft-halo', 'sparkle',
  'light-sweep', 'dust-motes', 'rising-particles', 'focus-pulse'
]);

export const CATEGORY_EFFECTS = Object.freeze({
  CER: ['light-sweep', 'soft-halo'],
  CLK: ['focus-pulse', 'rim-glow'],
  PNT: ['dust-motes', 'soft-halo'],
  BOK: ['dust-motes', 'rim-glow'],
  MET: ['light-sweep', 'sparkle'],
  JEW: ['sparkle', 'soft-halo', 'rising-particles']
});

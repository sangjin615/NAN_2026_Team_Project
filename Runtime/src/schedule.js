import { CATEGORY_EFFECTS, DEFAULT_GRADE_WEIGHTS, GRADES, LOTS_PER_DAY, RUN_DAYS, VISUAL_EFFECTS } from './constants.js';
import { createRng, shuffle, weightedChoice } from './rng.js';

function normalizedGradeWeights(balance) {
  const source = balance?.lotPool?.gradeWeights || DEFAULT_GRADE_WEIGHTS;
  return Object.fromEntries(GRADES.map((grade) => [grade, source[grade] ?? source[grade.toLowerCase()] ?? DEFAULT_GRADE_WEIGHTS[grade]]));
}

export const VISUAL_EFFECTS_PER_GRADE = Object.freeze({
  COMMON: 1,
  RARE: 2,
  EPIC: 3,
  LEGENDARY: 4,
});

const GRADE_EFFECTS = Object.freeze({
  COMMON: ['display-shadow', 'soft-halo'],
  RARE: ['display-shadow', 'rim-glow'],
  EPIC: ['display-shadow', 'light-sweep'],
  LEGENDARY: ['display-shadow', 'sparkle'],
});

export function normalizeVisualEffects(category, grade, effects = []) {
  const gradeEffects = GRADE_EFFECTS[grade] || GRADE_EFFECTS.COMMON;
  const categoryEffects = CATEGORY_EFFECTS[category] || ['dust-motes'];
  const count = VISUAL_EFFECTS_PER_GRADE[grade] || VISUAL_EFFECTS_PER_GRADE.COMMON;
  return [...new Set([...gradeEffects, ...effects, ...categoryEffects, ...VISUAL_EFFECTS])].slice(0, count);
}

export function selectVisualEffects(category, grade, rng) {
  const categoryEffects = shuffle(CATEGORY_EFFECTS[category] || ['dust-motes'], rng);
  return normalizeVisualEffects(category, grade, categoryEffects);
}

export function createRunSchedule({ catalog, balance, seed }) {
  const rng = createRng(seed);
  const itemPool = [];
  while (itemPool.length < RUN_DAYS * LOTS_PER_DAY) itemPool.push(...shuffle(catalog.items, rng));
  const weights = normalizedGradeWeights(balance);
  const gradeEntries = GRADES.map((grade) => [grade, weights[grade]]);
  const gradeBase = balance?.gradeBase || { common: 8000, rare: 16000, epic: 32000, legendary: 64000 };
  const qualityTable = balance?.quality?.table || [{ value: 1, label: '보통', weight: 1 }];

  const days = Array.from({ length: RUN_DAYS }, (_, dayIndex) => ({
    day: dayIndex + 1,
    lots: Array.from({ length: LOTS_PER_DAY }, (_, lotIndex) => {
      const item = itemPool[dayIndex * LOTS_PER_DAY + lotIndex];
      const grade = weightedChoice(gradeEntries, rng);
      const quality = weightedChoice(qualityTable.map((entry) => [entry, entry.weight]), rng);
      const catalogBasePrice = Number(gradeBase[grade.toLowerCase()] || 8000);
      const dayStage = Math.min(4, Math.floor(dayIndex / 3) + 1);
      const priceMultiplier = balance.shop?.priceMultiplierByDayStage?.[dayStage] ?? 1;
      const basePrice = Math.round(catalogBasePrice * priceMultiplier / 100) * 100;
      const trueValue = Math.round(basePrice * Number(quality.value || 1));
      return {
        lotId: `${seed}-d${dayIndex + 1}-l${lotIndex + 1}`,
        day: dayIndex + 1,
        order: lotIndex + 1,
        baseItemId: item.base_id,
        baseName: item.item_name_ko,
        category: item.category,
        categoryName: item.category_name_ko,
        grade,
        spritePath: item.grades[grade],
        spriteAnchor: item.sprite_anchors?.[grade] || { x: 0, y: 0 },
        quality: { label: quality.label, multiplier: quality.value },
        pricing: { catalogBasePrice, priceMultiplier, basePrice, trueValue },
        visualEffects: selectVisualEffects(item.category, grade, rng),
        content: null
      };
    })
  }));
  return { seed: String(seed), days };
}

export function validateSchedule(schedule) {
  const lots = schedule?.days?.flatMap((day) => day.lots) || [];
  return {
    valid: schedule?.days?.length === RUN_DAYS && lots.length === RUN_DAYS * LOTS_PER_DAY,
    days: schedule?.days?.length || 0,
    lots: lots.length,
    uniqueBaseItems: new Set(lots.map((lot) => lot.baseItemId)).size
  };
}

import { createRng, shuffle } from './rng.js';

export function createSetGraph(schedule, seed) {
  const rng = createRng(`${seed}:sets`);
  const lots = shuffle(schedule.days.flatMap((day) => day.lots), rng);
  const setCount = 12;
  const sets = Array.from({ length: setCount }, (_, index) => ({
    setId: `set-${String(index + 1).padStart(2, '0')}`,
    themeKey: ['voyage', 'dynasty', 'guild', 'astronomy', 'theatre', 'botany'][index % 6],
    lotIds: []
  }));
  lots.forEach((lot, index) => {
    const set = sets[index % sets.length];
    set.lotIds.push(lot.lotId);
    lot.setId = set.setId;
  });
  return sets;
}

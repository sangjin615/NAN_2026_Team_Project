import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRunSchedule, validateSchedule } from '../src/schedule.js';

const catalog = JSON.parse(await readFile(new URL('../assets/items/catalog.json', import.meta.url), 'utf8'));
const balance = JSON.parse(await readFile(new URL('../data/balance.json', import.meta.url), 'utf8'));
const counts = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };
let invalid = 0;
for (let index = 0; index < 900; index += 1) {
  const schedule = createRunSchedule({ catalog, balance, seed: String(900000 + index * 7) });
  if (!validateSchedule(schedule).valid) invalid += 1;
  for (const lot of schedule.days.flatMap((day) => day.lots)) counts[lot.grade] += 1;
}
const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
const report = { measuredAt: new Date().toISOString(), seeds: 900, totalLots: total, invalidSchedules: invalid, gradeDistribution: Object.fromEntries(Object.entries(counts).map(([grade, count]) => [grade, { count, rate: Number((count / total).toFixed(4)) }])) };
await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
await writeFile(new URL('../reports/generation-900-seeds.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

import { BUFFER_AHEAD_DAYS, RUN_DAYS } from './constants.js';

const fallbackThemes = {
  voyage: '항로와 바다의 흔적', dynasty: '몰락한 가문의 기록', guild: '상인 조합의 비밀',
  astronomy: '별과 시간의 관측', theatre: '무대 뒤의 이야기', botany: '약초와 정원의 기억'
};

export class FallbackContentProvider {
  async generateDay({ day, lots, sets }) {
    const setById = new Map(sets.map((set) => [set.setId, set]));
    return lots.map((lot) => {
      const set = setById.get(lot.setId);
      const theme = fallbackThemes[set?.themeKey] || '도시의 알려지지 않은 사연';
      return {
        lotId: lot.lotId,
        displayName: lot.baseName,
        description: `${lot.baseName}. ${theme} 테마와 연결된 ${{ COMMON: '일반', RARE: '희귀', EPIC: '영웅', LEGENDARY: '전설' }[lot.grade] || lot.grade} 등급 출품품이다.`,
        setId: lot.setId,
        provenance: 'local-fallback',
        generatedForDay: day
      };
    });
  }
}

export class GenerationBuffer {
  constructor({ provider = new FallbackContentProvider(), fallback = new FallbackContentProvider() } = {}) {
    this.provider = provider;
    this.fallback = fallback;
    this.readyDays = new Map();
    this.failures = [];
  }

  async ensure({ currentDay, schedule, sets }) {
    const lastDay = Math.min(RUN_DAYS, currentDay + BUFFER_AHEAD_DAYS);
    for (let day = currentDay; day <= lastDay; day += 1) {
      if (this.readyDays.has(day)) continue;
      const lots = schedule.days[day - 1].lots;
      let generated;
      try {
        generated = await this.provider.generateDay({ day, lots, sets });
        if (!Array.isArray(generated) || generated.length !== lots.length) throw new Error('provider returned an incomplete day');
      } catch (error) {
        this.failures.push({ day, message: error.message });
        generated = await this.fallback.generateDay({ day, lots, sets });
      }
      generated.forEach((content, index) => { lots[index].content = content; });
      this.readyDays.set(day, generated);
    }
    return { readyThrough: lastDay, failures: [...this.failures] };
  }
}

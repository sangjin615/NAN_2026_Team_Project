export class GenerationApiProvider {
  constructor(config) { this.config = config; }
  async request(body) {
    if (!this.config?.enabled || !this.config.endpoint) throw new Error('generation API is disabled');
    let lastError;
    for (let attempt = 0; attempt <= (this.config.retries || 0); attempt += 1) {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.config.timeoutMs || 8000);
      try {
        const response = await fetch(this.config.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
        if (!response.ok) throw new Error(`generation API ${response.status}`);
        return await response.json();
      } catch (error) { lastError = error; } finally { clearTimeout(timer); }
    }
    throw lastError;
  }

  async generateBlueprint({ runSeed, sets, market }) {
    const categories = Object.keys(market);
    const marketSignals = Array.from({ length: 12 }, (_, index) => {
      const leadingCategory = categories.reduce((best, category) => Math.abs(market[category][index] - 1) > Math.abs(market[best][index] - 1) ? category : best, categories[0]);
      const value = market[leadingCategory][index];
      return { day: index + 1, leadingCategory, direction: value > 1.04 ? '상승' : value < 0.96 ? '하락' : '보합' };
    });
    const request = {
      schemaVersion: this.config.schemaVersion || '1.0', mode: 'run-blueprint', runSeed,
      sets: sets.map(({ setId, themeKey }) => ({ setId, themeKey })),
      marketSignals,
    };
    const payload = await this.request(request);
    if (payload.schemaVersion !== request.schemaVersion || payload.runSeed !== runSeed || !Array.isArray(payload.marketArc) || payload.marketArc.length !== 12) throw new Error('blueprint response contract mismatch');
    if (JSON.stringify(payload.sets?.map(({ setId }) => setId)) !== JSON.stringify(request.sets.map(({ setId }) => setId))) throw new Error('blueprint set IDs mismatch');
    return payload;
  }

  async generateDay({ day, lots, sets, blueprint }) {
    const relevantSetIds = new Set(lots.map(({ setId }) => setId));
    const request = {
      schemaVersion: this.config.schemaVersion || '1.0', mode: 'daily-content',
      runSeed: blueprint?.runSeed || lots[0]?.lotId.split('-d')[0] || 'unknown', day,
      context: {
        premise: blueprint?.premise || '',
        market: blueprint?.marketArc?.[day - 1] || null,
        sets: (blueprint?.sets || sets).filter(({ setId }) => relevantSetIds.has(setId)),
      },
      lots: lots.map(({ lotId, baseName, category, grade, setId }) => ({ lotId, baseName, category, grade, setId })),
    };
    const payload = await this.request(request);
    if (payload.schemaVersion !== request.schemaVersion || payload.day !== day || !Array.isArray(payload.lots) || payload.lots.length !== lots.length) throw new Error('generation response contract mismatch');
    if (JSON.stringify(payload.lots.map(({ lotId }) => lotId)) !== JSON.stringify(request.lots.map(({ lotId }) => lotId))) throw new Error('generation LOT IDs mismatch');
    if (payload.lots.some((lot) => !lot.displayName || !lot.description)) throw new Error('generation response contains invalid LOT data');
    return payload.lots.map((lot) => ({ ...lot, provenance: 'generation-api', generatedForDay: day }));
  }
}

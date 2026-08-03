export class GenerationApiProvider {
  constructor(config) { this.config = config; }
  async generateDay({ day, lots, sets }) {
    if (!this.config?.enabled || !this.config.endpoint) throw new Error('generation API is disabled');
    const request = { schemaVersion: this.config.schemaVersion || '1.0', runSeed: lots[0]?.lotId.split('-d')[0] || 'unknown', day, lots: lots.map((lot) => ({ lotId: lot.lotId, baseItemId: lot.baseItemId, category: lot.category, grade: lot.grade, basePrice: lot.pricing.basePrice, trueValue: lot.pricing.trueValue, quality: lot.quality, setId: lot.setId })) };
    let lastError;
    for (let attempt = 0; attempt <= (this.config.retries || 0); attempt += 1) {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.config.timeoutMs || 8000);
      try {
        const response = await fetch(this.config.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal });
        if (!response.ok) throw new Error(`generation API ${response.status}`);
        const payload = await response.json();
        if (payload.schemaVersion !== request.schemaVersion || payload.day !== day || !Array.isArray(payload.lots) || payload.lots.length !== lots.length) throw new Error('generation response contract mismatch');
        const expected = new Set(lots.map((lot) => lot.lotId));
        if (payload.lots.some((lot) => !expected.has(lot.lotId) || !lot.displayName || !lot.description)) throw new Error('generation response contains invalid LOT data');
        return payload.lots.map((lot) => ({ ...lot, provenance: 'generation-api', generatedForDay: day }));
      } catch (error) { lastError = error; } finally { clearTimeout(timer); }
    }
    throw lastError;
  }
}

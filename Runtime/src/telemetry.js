export function recordEvent(state, type, detail = {}) {
  state.events ??= [];
  state.events.push({ sequence: state.events.length + 1, at: new Date().toISOString(), elapsedMs: Math.round(performance.now()), day: state.day, phase: state.phase, type, cash: state.cash, ...detail });
}

export function runMetrics(state) {
  return {
    version: 1, seed: state.seed, result: state.failure || (state.completed ? 'complete' : 'active'), dayReached: state.day,
    cash: state.cash, shopStage: state.shopStage, auctions: state.history.length,
    wins: state.history.filter((entry) => entry.won).length, questsCompleted: state.completedQuestCount,
    loans: state.events?.filter((event) => event.type === 'loan').length || 0,
    relics: state.relicChoices || [], events: state.events || []
  };
}

export function downloadRunLog(state) {
  const blob = new Blob([JSON.stringify(runMetrics(state), null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `unknown-auction-${state.seed}-day${state.day}.json`; link.click(); URL.revokeObjectURL(link.href);
}

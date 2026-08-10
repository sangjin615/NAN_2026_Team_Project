export function mergeOwnedRelicIds(...sources) {
  return [...new Set(sources.flatMap((source) => Array.isArray(source) ? source : []))];
}

export const AUCTION_INITIAL_TIME_MS = 15000;
export const AUCTION_BID_EXTENSION_MS = 3000;

export function extendAuctionDeadline(deadline, now = Date.now()) {
  const extendedDeadline = Number(deadline) + AUCTION_BID_EXTENSION_MS;
  const maximumDeadline = Number(now) + AUCTION_INITIAL_TIME_MS;
  return Math.min(extendedDeadline, maximumDeadline);
}

export function formatAuctionTime(remainingMs) {
  return `${(Math.max(0, remainingMs) / 1000).toFixed(1)}초`;
}

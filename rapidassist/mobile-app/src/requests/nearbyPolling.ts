/** Normal refresh of nearby providers while a map screen is focused. */
export const NEARBY_REFRESH_MS = 20_000;
const FIRST_RETRY_MS = 10_000;
const MAX_RETRY_MS = 160_000;

/** Wait before retrying after `failures` consecutive failed refreshes: 10 s, 20 s, 40 s, 80 s, then 160 s. */
export function nearbyRetryMs(failures: number) {
  if (failures <= 0) return NEARBY_REFRESH_MS;
  return Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** (failures - 1));
}

/** Banner text while nearby providers cannot be refreshed: when the shown list is from, or that nothing loaded yet. */
export function nearbyOfflineMessage(updatedAt: number | null, clock: (iso: string) => string) {
  return updatedAt
    ? `Offline – showing last update from ${clock(new Date(updatedAt).toISOString())}. Retrying…`
    : "Offline – couldn't load nearby providers yet. Retrying…";
}

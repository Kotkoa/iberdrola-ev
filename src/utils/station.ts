/**
 * Determines if a station should be saved to database cache.
 * Only FREE stations (priceKwh === 0) should be saved.
 * This prevents cluttering the database with paid stations.
 */
export function shouldSaveStationToCache(priceKwh: number | undefined): boolean {
  return priceKwh === 0;
}

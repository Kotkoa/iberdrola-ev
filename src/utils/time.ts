export const formatDuration = (durationMinutes: number | null): string | null => {
  if (durationMinutes === null || !Number.isFinite(durationMinutes)) return null;
  if (durationMinutes < 1) return '< 1 min';

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  return hours > 0 ? `${hours} h${minutes > 0 ? ` ${minutes} min` : ''}` : `${minutes} min`;
};

/**
 * Checks if data is stale based on created timestamp and TTL
 * @param createdAt ISO timestamp when data was created
 * @param ttlMinutes Time-to-live in minutes
 * @returns true if data is older than TTL or createdAt is null
 *
 * @example
 * // Data from 3 minutes ago, TTL 5 minutes
 * isDataStale('2024-01-01T12:00:00Z', 5) // false (fresh)
 *
 * // Data from 10 minutes ago, TTL 5 minutes
 * isDataStale('2024-01-01T12:00:00Z', 5) // true (stale)
 *
 * // Null timestamp
 * isDataStale(null, 5) // true (stale)
 */
export function isDataStale(createdAt: string | null, ttlMinutes: number): boolean {
  if (!createdAt) return true;
  const created = new Date(createdAt).getTime();
  // Invalid dates return NaN from getTime()
  if (isNaN(created)) return true;
  const now = Date.now();
  const ageMs = now - created;
  return ageMs > ttlMinutes * 60 * 1000;
}

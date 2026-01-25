export const formatDuration = (durationMinutes: number | null): string | null => {
  if (durationMinutes === null || !Number.isFinite(durationMinutes)) return null;
  if (durationMinutes < 1) return '< 1 min';

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  return hours > 0 ? `${hours} h${minutes > 0 ? ` ${minutes} min` : ''}` : `${minutes} min`;
};

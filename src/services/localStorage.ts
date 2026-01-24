const STORAGE_KEYS = {
  PRIMARY_STATION: 'iberdrola_primary_station',
} as const;

export interface PrimaryStationData {
  cpId: number;
  cuprId: number;
}

export function getPrimaryStation(): PrimaryStationData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PRIMARY_STATION);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as PrimaryStationData;
    if (typeof parsed.cpId === 'number' && typeof parsed.cuprId === 'number') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function getPrimaryStationId(): number | null {
  const data = getPrimaryStation();
  return data?.cpId ?? null;
}

export function setPrimaryStation(cpId: number, cuprId: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PRIMARY_STATION, JSON.stringify({ cpId, cuprId }));
  } catch {
    console.warn('Failed to save primary station to localStorage');
  }
}

export function clearPrimaryStation(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.PRIMARY_STATION);
  } catch {
    console.warn('Failed to clear primary station from localStorage');
  }
}

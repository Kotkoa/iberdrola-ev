/** Test station matching the real primary station */
export const TEST_STATION = {
  cpId: 147988,
  cuprId: 144569,
  name: 'Pego Cervantes',
  address: 'Calle Miguel de Cervantes, 03780 Pego, Alicante',
  latitude: 38.8398,
  longitude: -0.1197,
} as const;

/** TTL used in test factories (minutes) */
export const TEST_TTL_MINUTES = 5;

/** localStorage key for primary station (must match src/services/localStorage.ts) */
export const STORAGE_KEY_PRIMARY_STATION = 'iberdrola_primary_station';

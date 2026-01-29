/**
 * Application-wide constants
 */

// ========================
// Charging Point Status
// ========================
export const CHARGING_POINT_STATUS = {
  AVAILABLE: 'AVAILABLE',
  BUSY: 'BUSY',
  CLOSED: 'CLOSED',
} as const;

export type ChargingPointStatus =
  (typeof CHARGING_POINT_STATUS)[keyof typeof CHARGING_POINT_STATUS];

// ========================
// Default Coordinates
// ========================
export const DEFAULT_CHARGING_POINT = {
  LATITUDE: 38.839266,
  LONGITUDE: -0.120815,
} as const;

// ========================
// API Configuration
// ========================
const CORS_PROXY = 'https://corsproxy.io/?';
const IBERDROLA_BASE_URL = 'https://www.iberdrola.es/o/webclipb/iberdrola/puntosrecargacontroller';

// Primary: Cloudflare Worker (reliable, different IP range)
export const CLOUDFLARE_PROXY_ENDPOINT = 'https://calm-base-a362.kotkoa.workers.dev';

// Secondary: Vercel API Route (blocked by Iberdrola)
export const VERCEL_PROXY_ENDPOINT = '/api/iberdrola';

// Fallback: External CORS proxy
export const API_ENDPOINTS = {
  LIST_CHARGING_POINTS: `${CORS_PROXY}${IBERDROLA_BASE_URL}/getListarPuntosRecarga`,
  GET_CHARGING_POINT_DETAILS: `${CORS_PROXY}${IBERDROLA_BASE_URL}/getDatosPuntoRecarga`,
} as const;

// Endpoint types for Vercel proxy
export const PROXY_ENDPOINT_TYPES = {
  LIST: 'list',
  DETAILS: 'details',
} as const;

// Direct Iberdrola API endpoints (fallback - usually CORS blocked)
export const IBERDROLA_DIRECT_ENDPOINTS = {
  LIST_CHARGING_POINTS: `${IBERDROLA_BASE_URL}/getListarPuntosRecarga`,
  GET_CHARGING_POINT_DETAILS: `${IBERDROLA_BASE_URL}/getDatosPuntoRecarga`,
} as const;

// ========================
// Search Filters
// ========================
export const SEARCH_FILTERS = {
  CHARGE_POINT_TYPES: ['P', 'R', 'I', 'N'] as const,
  SOCKET_STATUS: [] as string[],
  ADVANTAGEOUS: false,
  CONNECTORS_TYPE: ['2', '7'] as const, // Type 2 connectors
  LOAD_SPEED: [] as string[],
} as const;

// ========================
// Geographic Calculations
// ========================
export const GEO_CONSTANTS = {
  /** Approximate kilometers per degree of latitude */
  KM_PER_DEGREE_LAT: 111,
  /** Converts degrees to radians */
  DEG_TO_RAD: Math.PI / 180,
} as const;

// ========================
// Time Intervals (milliseconds)
// ========================
export const TIME_INTERVALS = {
  /** Update interval for time-based displays (1 minute) */
  UPDATE_INTERVAL_MS: 60000,
  /** Geolocation timeout (10 seconds) */
  GEOLOCATION_TIMEOUT_MS: 10000,
  /** Snackbar auto-hide duration (5 seconds) */
  SNACKBAR_AUTO_HIDE_MS: 5000,
} as const;

// ========================
// Search Radius Options (km)
// ========================
export const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
export type RadiusOption = (typeof RADIUS_OPTIONS)[number];

// ========================
// Station Status Codes
// ========================
export const STATION_SITUATION_CODES = {
  OPERATIONAL: 'OPER',
  MAINTENANCE: 'MAINT',
  OUT_OF_SERVICE: 'OOS',
} as const;

export type StationSituationCode =
  (typeof STATION_SITUATION_CODES)[keyof typeof STATION_SITUATION_CODES];

// ========================
// Socket Type Names
// ========================
export const SOCKET_TYPE_NAMES: Record<string, string> = {
  '1': 'Type 1 (SAE J1772)',
  '2': 'Type 2 (Mennekes)',
  '4': 'CHAdeMO',
  '27': 'CCS Combo 2',
} as const;

// ========================
// Charge Speed Labels
// ========================
export const CHARGE_SPEED_LABELS: Record<number, string> = {
  1: 'Slow (3-7 kW)',
  2: 'Fast (11-22 kW)',
  3: 'Rapid (43-50 kW)',
  4: 'Ultra-rapid (150+ kW)',
} as const;

// ========================
// Storage Keys
// ========================
export const STORAGE_KEYS = {
  PRIMARY_STATION_ID: 'iberdrola_primary_station_id',
} as const;

// ========================
// Tab Names
// ========================
export const TAB_NAMES = {
  STATION: 'station',
  SEARCH: 'search',
} as const;

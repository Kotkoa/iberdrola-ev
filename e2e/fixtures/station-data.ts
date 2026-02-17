import { TEST_STATION } from './constants';

interface SnapshotOptions {
  cpId?: number;
  observedAt?: string;
  port1Status?: string | null;
  port2Status?: string | null;
  overallStatus?: string | null;
  port1PowerKw?: number | null;
  port2PowerKw?: number | null;
  port1PriceKwh?: number | null;
  port2PriceKwh?: number | null;
  emergencyStopPressed?: boolean | null;
  situationCode?: string | null;
}

/**
 * Creates a station_snapshots row matching RawSnapshotData from api/charger.ts.
 * Default: both ports AVAILABLE, observed 2 minutes ago (fresh within TTL=5).
 */
export function createSnapshot(options: SnapshotOptions = {}) {
  const now = new Date();
  const defaultObservedAt = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
  const observedAt = options.observedAt ?? defaultObservedAt;

  return {
    id: `test-snapshot-${Date.now()}`,
    cp_id: options.cpId ?? TEST_STATION.cpId,
    source: 'scraper',
    observed_at: observedAt,
    payload_hash: 'test-hash-000',
    port1_status: options.port1Status ?? 'AVAILABLE',
    port1_power_kw: options.port1PowerKw ?? 22,
    port1_price_kwh: options.port1PriceKwh ?? 0,
    port1_update_date: observedAt,
    port2_status: options.port2Status ?? 'BUSY',
    port2_power_kw: options.port2PowerKw ?? 22,
    port2_price_kwh: options.port2PriceKwh ?? 0,
    port2_update_date: observedAt,
    overall_status: options.overallStatus ?? 'AVAILABLE',
    emergency_stop_pressed: options.emergencyStopPressed ?? false,
    situation_code: options.situationCode ?? 'OPER',
    created_at: observedAt,
  };
}

/** Snapshot within TTL (2 min ago, fresh for TTL=5) */
export function createFreshSnapshot(options: SnapshotOptions = {}) {
  const freshTime = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  return createSnapshot({ observedAt: freshTime, ...options });
}

/** Snapshot past TTL (20 min ago, stale for any reasonable TTL) */
export function createStaleSnapshot(options: SnapshotOptions = {}) {
  const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  return createSnapshot({ observedAt: staleTime, ...options });
}

interface MetadataOptions {
  cpId?: number;
  cuprId?: number;
  latitude?: number | null;
  longitude?: number | null;
  addressFull?: string | null;
}

/**
 * Creates a station_metadata row matching RawMetadataRow from api/charger.ts.
 */
export function createMetadata(options: MetadataOptions = {}) {
  return {
    cp_id: options.cpId ?? TEST_STATION.cpId,
    cupr_id: options.cuprId ?? TEST_STATION.cuprId,
    latitude: options.latitude ?? TEST_STATION.latitude,
    longitude: options.longitude ?? TEST_STATION.longitude,
    address_full: options.addressFull ?? TEST_STATION.address,
  };
}

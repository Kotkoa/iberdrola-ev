import { useEffect, useState, useRef } from 'react';
import {
  getLatestSnapshot,
  getStationMetadata,
  subscribeToSnapshots,
  snapshotToChargerStatus,
  type StationSnapshot,
} from '../../api/charger';
import { pollStation, isRateLimited } from '../services/apiClient';
import { isStationRateLimited, markRateLimited } from '../utils/rateLimitCache';
import { isDataStale } from '../utils/time';
import { ReconnectionManager } from '../utils/reconnectionManager';
import type { ChargerStatus, StationDataStatus, StationDataState } from '../../types/charger';
import type { RealtimeConnectionState, SubscriptionResult } from '../../types/realtime';
import type { PollStationData } from '../types/api';
import { DATA_FRESHNESS } from '../constants';

function getObservationTimestamp(
  value: { observed_at?: string | null; created_at?: string | null } | null | undefined
): string | null {
  return value?.observed_at ?? value?.created_at ?? null;
}

function getObservationTimeMs(
  value: { observed_at?: string | null; created_at?: string | null } | null | undefined
): number {
  const timestamp = getObservationTimestamp(value);
  if (!timestamp) return 0;

  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Converts poll-station API response to ChargerStatus
 */
function pollDataToChargerStatus(
  pollData: PollStationData,
  metadata?: {
    cp_name?: string;
    cp_latitude?: number;
    cp_longitude?: number;
    address_full?: string;
  }
): ChargerStatus {
  return {
    id: `poll-${pollData.cp_id}-${pollData.observed_at}`,
    created_at: pollData.observed_at,
    cp_id: pollData.cp_id,
    cp_name: metadata?.cp_name ?? 'Unknown',
    schedule: null,
    port1_status: pollData.port1_status,
    port1_power_kw: pollData.port1_power_kw ?? null,
    port1_price_kwh: pollData.port1_price_kwh ?? null,
    port1_update_date: pollData.port1_update_date,
    port2_status: pollData.port2_status,
    port2_power_kw: pollData.port2_power_kw ?? null,
    port2_price_kwh: pollData.port2_price_kwh ?? null,
    port2_update_date: pollData.port2_update_date,
    overall_status: pollData.overall_status,
    overall_update_date: pollData.observed_at,
    emergency_stop_pressed: pollData.emergency_stop_pressed ?? null,
    situation_code: pollData.situation_code ?? null,
    cp_latitude: metadata?.cp_latitude,
    cp_longitude: metadata?.cp_longitude,
    address_full: metadata?.address_full,
  };
}

/**
 * Manages station data with TTL-based freshness checking and honest staleness reporting.
 *
 * Flow:
 * 1. Fetch snapshot + metadata from Supabase (parallel)
 * 2. Show data immediately (even if stale) — no skeleton when cache exists
 * 3. If stale → call pollStation in background to trigger scraper
 * 4. Subscribe to Realtime (immediately, not after load)
 * 5. All data updates go through applyIfNewer (timestamp-based gate)
 * 6. Fallback: if Realtime doesn't deliver within 40s, re-fetch snapshot
 */
export function useStationData(
  cpId: number | null,
  cuprId: number | undefined,
  ttlMinutes: number = DATA_FRESHNESS.STATION_TTL_MINUTES
): StationDataStatus {
  const [internalState, setInternalState] =
    useState<Exclude<StationDataState, 'idle'>>('loading_cache');
  const [data, setData] = useState<ChargerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('disconnected');
  const [isRateLimitedState, setIsRateLimitedState] = useState(false);
  const [nextPollIn, setNextPollIn] = useState<number | null>(null);
  const [scraperTriggered, setScraperTriggered] = useState(false);
  const subscriptionRef = useRef<SubscriptionResult | null>(null);
  const reconnectionManagerRef = useRef<ReconnectionManager>(new ReconnectionManager());
  const metadataRef = useRef<{
    cp_name?: string;
    cp_latitude?: number;
    cp_longitude?: number;
    address_full?: string;
  } | null>(null);
  const prevCpIdRef = useRef<number | null>(null);
  const currentDataTimestampRef = useRef<number>(0);
  const scraperTriggeredRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!cpId) {
      prevCpIdRef.current = null;
      return;
    }

    const cpIdChanged = prevCpIdRef.current !== null && prevCpIdRef.current !== cpId;
    prevCpIdRef.current = cpId;

    let active = true;
    let unsubscribe: (() => void) | null = null;

    /**
     * Single gate for all data updates. Prevents race conditions between
     * poll-station, Realtime, and fallback by comparing timestamps.
     */
    const applyIfNewer = (chargerStatus: ChargerStatus, timestamp: number, source: string) => {
      if (!active) return false;
      if (timestamp <= currentDataTimestampRef.current) return false;
      console.log(`[useStationData] Applying update from ${source} for ${cpId}`);
      currentDataTimestampRef.current = timestamp;
      setData(chargerStatus);
      setInternalState('ready');
      return true;
    };

    const load = async () => {
      try {
        if (cpIdChanged) {
          setData(null);
          setError(null);
          setConnectionState('disconnected');
          setIsRateLimitedState(false);
          setNextPollIn(null);
          setScraperTriggered(false);
          scraperTriggeredRef.current = false;
          currentDataTimestampRef.current = 0;
          reconnectionManagerRef.current.reset();
          clearTimeout(fallbackTimerRef.current);
        }
        setInternalState('loading_cache');
        setError(null);

        const [snapshot, metadata] = await Promise.all([
          getLatestSnapshot(cpId),
          getStationMetadata(cpId),
        ]);

        if (!active) return;

        metadataRef.current = metadata
          ? {
              cp_name: metadata.address_full?.split(',')[0] || 'Unknown',
              cp_latitude: metadata.latitude ?? undefined,
              cp_longitude: metadata.longitude ?? undefined,
              address_full: metadata.address_full ?? undefined,
            }
          : null;

        // Realtime subscription — created immediately
        const createSubscription = () => {
          setConnectionState('connecting');
          subscriptionRef.current = subscribeToSnapshots(
            cpId,
            (newSnapshot: StationSnapshot) => {
              if (!active) return;

              const newTimestamp = getObservationTimeMs(newSnapshot);
              const chargerStatus = snapshotToChargerStatus(
                newSnapshot,
                metadataRef.current ?? undefined
              );

              if (applyIfNewer(chargerStatus, newTimestamp, 'realtime')) {
                // Fresh data arrived — clear fallback timer and scraper flag
                clearTimeout(fallbackTimerRef.current);
                setScraperTriggered(false);
                scraperTriggeredRef.current = false;
              }
            },
            (newState: RealtimeConnectionState) => {
              if (!active) return;
              console.log(`[useStationData] Connection state changed to: ${newState}`);

              if (newState === 'connected') {
                reconnectionManagerRef.current.reset();
                setConnectionState('connected');
              } else if (newState === 'error' || newState === 'disconnected') {
                setConnectionState('reconnecting');
                const scheduled = reconnectionManagerRef.current.scheduleReconnect(() => {
                  if (!active) return;
                  console.log(`[useStationData] Attempting reconnection for ${cpId}`);
                  subscriptionRef.current?.unsubscribe();
                  createSubscription();
                });

                if (!scheduled) {
                  setConnectionState('error');
                }
              } else {
                setConnectionState(newState);
              }
            }
          );
        };

        createSubscription();
        unsubscribe = () => subscriptionRef.current?.unsubscribe();

        const showError = (message: string) => {
          setError(message);
          setInternalState('error');
        };

        const stale = isDataStale(getObservationTimestamp(snapshot), ttlMinutes);

        // 1. Fresh cache hit (skip on station switch to trigger on-demand scrape)
        if (snapshot && !stale && !cpIdChanged) {
          console.log(`[useStationData] Using fresh cache for ${cpId}`);
          const chargerStatus = snapshotToChargerStatus(snapshot, metadataRef.current ?? undefined);
          applyIfNewer(chargerStatus, getObservationTimeMs(snapshot), 'cache');
          return;
        }

        // 2. No cuprId — can't call Edge, use whatever we have
        if (cuprId === undefined) {
          if (snapshot) {
            console.log(`[useStationData] Using stale data for ${cpId} (no cuprId for refresh)`);
            const chargerStatus = snapshotToChargerStatus(
              snapshot,
              metadataRef.current ?? undefined
            );
            applyIfNewer(chargerStatus, getObservationTimeMs(snapshot), 'cache-stale');
          } else {
            showError('No data available');
          }
          return;
        }

        // 3. Rate limited in local cache — skip API call
        if (isStationRateLimited(cuprId)) {
          console.log(`[useStationData] Rate limited for ${cpId}, using cache`);
          if (snapshot) {
            const chargerStatus = snapshotToChargerStatus(
              snapshot,
              metadataRef.current ?? undefined
            );
            applyIfNewer(chargerStatus, getObservationTimeMs(snapshot), 'cache-ratelimited');
            setIsRateLimitedState(true);
          } else {
            showError('Data unavailable (rate limited)');
          }
          return;
        }

        // 4. Stale or missing — show stale data immediately, poll in background
        if (snapshot) {
          // Show stale data right away (no loading_api skeleton)
          console.log(`[useStationData] Showing stale data for ${cpId}, polling in background`);
          const chargerStatus = snapshotToChargerStatus(snapshot, metadataRef.current ?? undefined);
          applyIfNewer(chargerStatus, getObservationTimeMs(snapshot), 'cache-stale');
        } else {
          // No cache at all — show loading state
          setInternalState('loading_api');
        }

        // Call pollStation in background (triggers scraper)
        // Show "Updating..." immediately while poll is in flight
        setScraperTriggered(true);
        scraperTriggeredRef.current = true;
        console.log(`[useStationData] Calling pollStation for ${cpId}`);
        const result = await pollStation(cuprId);
        if (!active) return;

        if (result.ok) {
          const chargerStatus = pollDataToChargerStatus(
            result.data,
            metadataRef.current ?? undefined
          );
          const newTimestamp = new Date(result.data.observed_at).getTime();
          applyIfNewer(chargerStatus, newTimestamp, 'poll-station');
          setIsRateLimitedState(false);
          setNextPollIn(null);

          // Read meta — was scraper actually triggered?
          if (!result.meta.scraper_triggered) {
            // Poll returned fresh data directly — no scraper needed
            setScraperTriggered(false);
            scraperTriggeredRef.current = false;
          } else {
            // Start fallback timer in case Realtime doesn't deliver
            fallbackTimerRef.current = setTimeout(async () => {
              if (!active) return;
              if (!scraperTriggeredRef.current) return; // Already resolved by Realtime

              console.log(`[useStationData] Realtime fallback for ${cpId}`);
              const freshSnapshot = await getLatestSnapshot(cpId);
              if (!active) return;

              if (freshSnapshot) {
                const ts = getObservationTimeMs(freshSnapshot);
                const cs = snapshotToChargerStatus(freshSnapshot, metadataRef.current ?? undefined);
                applyIfNewer(cs, ts, 'fallback');
              }
              setScraperTriggered(false);
              scraperTriggeredRef.current = false;
            }, DATA_FRESHNESS.REALTIME_FALLBACK_TIMEOUT_MS);
          }
          return;
        }

        // Poll failed — reset optimistic scraperTriggered
        setScraperTriggered(false);
        scraperTriggeredRef.current = false;

        if (isRateLimited(result)) {
          const retryAfter = result.error.retry_after ?? 300;
          markRateLimited(cuprId, retryAfter);
          console.log(`[useStationData] Rate limited for ${cpId}, retry after ${retryAfter}s`);
          if (snapshot) {
            // Stale data already shown above — just set flags
            setIsRateLimitedState(true);
            setNextPollIn(retryAfter);
          } else {
            showError('Data unavailable (rate limited)');
          }
          return;
        }

        // Other API error — stale data already shown if available
        console.log(
          `[useStationData] API error for ${cpId}: ${result.error.code}, using cache fallback`
        );
        if (!snapshot) {
          showError(result.error.message);
        }
      } catch (e) {
        if (active) {
          console.error(`[useStationData] Error loading ${cpId}:`, e);
          setError(e instanceof Error ? e.message : 'Unknown error');
          setInternalState('error');
        }
      }
    };

    load();

    const reconnectionManager = reconnectionManagerRef.current;

    return () => {
      active = false;
      unsubscribe?.();
      reconnectionManager.cancelPending();
      clearTimeout(fallbackTimerRef.current);
    };
  }, [cpId, cuprId, ttlMinutes]);

  // Periodic re-fetch: trigger pollStation when data becomes stale.
  // Skips if scraperTriggered (fallback timer handles that case).
  useEffect(() => {
    if (!cpId || cuprId === undefined) return;

    let active = true;
    const CHECK_INTERVAL_MS = 60_000;
    const ttlMs = ttlMinutes * 60 * 1000;

    const intervalId = setInterval(async () => {
      if (!active) return;

      // Skip if fallback timer is handling scraper wait
      if (scraperTriggeredRef.current) return;

      const timestamp = currentDataTimestampRef.current;
      if (timestamp === 0) return;

      const ageMs = Date.now() - timestamp;
      if (ageMs <= ttlMs) return;

      if (isStationRateLimited(cuprId)) return;

      console.log(`[useStationData] Periodic refresh for ${cpId}`);
      const result = await pollStation(cuprId);

      if (!active) return;

      if (result.ok) {
        const newTimestamp = new Date(result.data.observed_at).getTime();
        if (newTimestamp > currentDataTimestampRef.current) {
          const chargerStatus = pollDataToChargerStatus(
            result.data,
            metadataRef.current ?? undefined
          );
          currentDataTimestampRef.current = newTimestamp;
          setData(chargerStatus);
        }

        if (result.meta.scraper_triggered) {
          setScraperTriggered(true);
          scraperTriggeredRef.current = true;

          // Fallback timer — same pattern as initial load (lines 294-309)
          clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = setTimeout(async () => {
            if (!active) return;
            if (!scraperTriggeredRef.current) return;

            console.log(`[useStationData] Periodic refresh fallback for ${cpId}`);
            const freshSnapshot = await getLatestSnapshot(cpId);
            if (!active) return;

            if (freshSnapshot) {
              const ts = getObservationTimeMs(freshSnapshot);
              if (ts > currentDataTimestampRef.current) {
                const cs = snapshotToChargerStatus(freshSnapshot, metadataRef.current ?? undefined);
                currentDataTimestampRef.current = ts;
                setData(cs);
              }
            }
            setScraperTriggered(false);
            scraperTriggeredRef.current = false;
          }, DATA_FRESHNESS.REALTIME_FALLBACK_TIMEOUT_MS);
        }
      } else if (isRateLimited(result)) {
        const retryAfter = result.error.retry_after ?? 300;
        markRateLimited(cuprId, retryAfter);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(intervalId);
      clearTimeout(fallbackTimerRef.current);
    };
  }, [cpId, cuprId, ttlMinutes]);

  // Derive state
  const state: StationDataState = cpId === null ? 'idle' : internalState;
  const stale = isDataStale(data?.overall_update_date ?? data?.created_at ?? null, ttlMinutes);
  const observedAt = data?.overall_update_date ?? data?.created_at ?? null;

  if (cpId === null) {
    return {
      state: 'idle',
      data: null,
      error: null,
      connectionState: 'disconnected',
      hasRealtime: false,
      isStale: false,
      isRateLimited: false,
      nextPollIn: null,
      scraperTriggered: false,
      observedAt: null,
    };
  }

  const hasRealtime = connectionState === 'connected';

  return {
    state,
    data,
    error,
    connectionState,
    hasRealtime,
    isStale: stale,
    isRateLimited: isRateLimitedState,
    nextPollIn,
    scraperTriggered,
    observedAt,
  };
}

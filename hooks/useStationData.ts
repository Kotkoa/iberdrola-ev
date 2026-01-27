import { useEffect, useState, useRef } from 'react';
import {
  getLatestSnapshot,
  getStationMetadata,
  subscribeToSnapshots,
  snapshotToChargerStatus,
  type StationSnapshot,
} from '../api/charger';
import { fetchStationViaEdge } from '../src/services/stationApi';
import { isDataStale } from '../src/utils/time';
import type { ChargerStatus, StationDataStatus, StationDataState } from '../types/charger';

const TTL_MINUTES = 15;

/**
 * Manages station data with TTL-based freshness checking
 *
 * Flow:
 * 1. Fetch snapshot + metadata from Supabase (parallel)
 * 2. Check if snapshot is fresh (< 5 min old)
 * 3. If stale/missing → fetch from Edge
 * 4. Subscribe to realtime (immediately, not after load)
 * 5. Merge realtime updates by timestamp (only if newer)
 *
 * @param cpId Station ID to load
 * @param cuprId CUPR ID for Edge fallback
 * @param ttlMinutes Cache TTL (default 5)
 * @returns Station data status with state machine
 *
 * @example
 * ```typescript
 * const { state, data, error, hasRealtime } = useStationData(cpId, cuprId);
 *
 * if (state === 'loading_cache' || state === 'loading_api') {
 *   return <Skeleton />;
 * }
 *
 * if (state === 'error') {
 *   return <Error message={error} />;
 * }
 *
 * return <StationDetails station={data} />;
 * ```
 */
export function useStationData(
  cpId: number | null,
  cuprId: number | undefined,
  ttlMinutes: number = TTL_MINUTES
): StationDataStatus {
  // Internal state for when cpId is valid - 'idle' is derived from cpId === null
  const [internalState, setInternalState] =
    useState<Exclude<StationDataState, 'idle'>>('loading_cache');
  const [data, setData] = useState<ChargerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasRealtime, setHasRealtime] = useState(false);
  const metadataRef = useRef<{
    cp_name?: string;
    cp_latitude?: number;
    cp_longitude?: number;
    address_full?: string;
  } | null>(null);
  const prevCpIdRef = useRef<number | null>(null);
  const currentDataTimestampRef = useRef<number>(0);

  useEffect(() => {
    // If cpId is null, skip loading - state will be derived as 'idle'
    if (!cpId) {
      prevCpIdRef.current = null;
      return;
    }

    // Detect cpId change and reset state
    const cpIdChanged = prevCpIdRef.current !== cpId;
    prevCpIdRef.current = cpId;

    let active = true;
    let unsubscribe: (() => void) | null = null;

    const load = async () => {
      try {
        // Reset state if cpId changed
        if (cpIdChanged) {
          setData(null);
          setError(null);
          setHasRealtime(false);
          currentDataTimestampRef.current = 0;
        }
        setInternalState('loading_cache');
        setError(null);

        // Fetch snapshot + metadata in parallel
        const [snapshot, metadata] = await Promise.all([
          getLatestSnapshot(cpId),
          getStationMetadata(cpId),
        ]);

        if (!active) return;

        // Store metadata for realtime updates
        metadataRef.current = metadata
          ? {
              cp_name: metadata.address_full?.split(',')[0] || 'Unknown',
              cp_latitude: metadata.latitude ?? undefined,
              cp_longitude: metadata.longitude ?? undefined,
              address_full: metadata.address_full ?? undefined,
            }
          : null;

        // Subscribe to realtime immediately (not after load)
        unsubscribe = subscribeToSnapshots(cpId, (newSnapshot: StationSnapshot) => {
          if (!active) return;

          // Only update if new data is fresher than current
          const newTimestamp = new Date(newSnapshot.created_at).getTime();

          if (newTimestamp > currentDataTimestampRef.current) {
            console.log(`[useStationData] Realtime update for ${cpId}, newer data received`);
            const chargerStatus = snapshotToChargerStatus(
              newSnapshot,
              metadataRef.current ?? undefined
            );
            currentDataTimestampRef.current = newTimestamp;
            setData(chargerStatus);
            setHasRealtime(true);
            setInternalState('ready');
          }
        });

        // Check if snapshot is fresh
        const stale = isDataStale(snapshot?.created_at ?? null, ttlMinutes);

        if (snapshot && !stale) {
          // Fresh data available from cache
          console.log(`[useStationData] Using fresh cache for ${cpId}`);
          const chargerStatus = snapshotToChargerStatus(snapshot, metadataRef.current ?? undefined);
          currentDataTimestampRef.current = new Date(snapshot.created_at).getTime();
          setData(chargerStatus);
          setHasRealtime(true);
          setInternalState('ready');
        } else if (cuprId !== undefined) {
          // Stale or missing - fetch from Edge
          console.log(
            `[useStationData] Cache ${stale ? 'stale' : 'missing'} for ${cpId}, fetching from Edge`
          );
          setInternalState('loading_api');

          const edgeData = await fetchStationViaEdge(cpId, cuprId);

          if (!active) return;

          if (edgeData) {
            currentDataTimestampRef.current = new Date(edgeData.created_at).getTime();
            setData(edgeData);
            setHasRealtime(true); // Edge stores snapshot, realtime will work
            setInternalState('ready');
          } else {
            setError('Station not found');
            setInternalState('error');
          }
        } else {
          // No cuprId, can't fetch from Edge
          if (snapshot) {
            // Use stale data (better than nothing)
            console.log(`[useStationData] Using stale data for ${cpId} (no cuprId for refresh)`);
            const chargerStatus = snapshotToChargerStatus(
              snapshot,
              metadataRef.current ?? undefined
            );
            currentDataTimestampRef.current = new Date(snapshot.created_at).getTime();
            setData(chargerStatus);
            setHasRealtime(true);
            setInternalState('ready');
          } else {
            setError('No data available');
            setInternalState('error');
          }
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

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [cpId, cuprId, ttlMinutes]);

  // Derive state: 'idle' when cpId is null, otherwise use internal state
  const state: StationDataState = cpId === null ? 'idle' : internalState;
  const stale = data?.created_at ? isDataStale(data.created_at, ttlMinutes) : false;

  // Return idle state with nulls when no station selected
  if (cpId === null) {
    return {
      state: 'idle',
      data: null,
      error: null,
      hasRealtime: false,
      isStale: false,
    };
  }

  return {
    state,
    data,
    error,
    hasRealtime,
    isStale: stale,
  };
}

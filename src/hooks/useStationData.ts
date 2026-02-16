import { useEffect, useState, useRef } from 'react';
import {
  getLatestSnapshot,
  getStationMetadata,
  subscribeToSnapshots,
  snapshotToChargerStatus,
  type StationSnapshot,
} from '../../api/charger';
import { pollStation, isApiSuccess, isRateLimited } from '../services/apiClient';
import { isStationRateLimited, markRateLimited } from '../utils/rateLimitCache';
import { isDataStale } from '../utils/time';
import { ReconnectionManager } from '../utils/reconnectionManager';
import type { ChargerStatus, StationDataStatus, StationDataState } from '../../types/charger';
import type { RealtimeConnectionState, SubscriptionResult } from '../../types/realtime';
import type { PollStationData } from '../types/api';

const TTL_MINUTES = 15;

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
    port2_status: pollData.port2_status,
    port1_power_kw: null,
    port1_update_date: pollData.port1_update_date,
    port2_power_kw: null,
    port2_update_date: pollData.port2_update_date,
    overall_status: pollData.overall_status,
    overall_update_date: pollData.observed_at,
    cp_latitude: metadata?.cp_latitude,
    cp_longitude: metadata?.cp_longitude,
    address_full: metadata?.address_full,
  };
}

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
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('disconnected');
  const [isRateLimitedState, setIsRateLimitedState] = useState(false);
  const [nextPollIn, setNextPollIn] = useState<number | null>(null);
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

  useEffect(() => {
    // If cpId is null, skip loading - state will be derived as 'idle'
    if (!cpId) {
      prevCpIdRef.current = null;
      return;
    }

    // Detect station switch (not initial mount) to force on-demand scrape
    const cpIdChanged = prevCpIdRef.current !== null && prevCpIdRef.current !== cpId;
    prevCpIdRef.current = cpId;

    let active = true;
    let unsubscribe: (() => void) | null = null;

    const load = async () => {
      try {
        // Reset state if cpId changed
        if (cpIdChanged) {
          setData(null);
          setError(null);
          setConnectionState('disconnected');
          setIsRateLimitedState(false);
          setNextPollIn(null);
          currentDataTimestampRef.current = 0;
          reconnectionManagerRef.current.reset();
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

        // Function to create realtime subscription
        const createSubscription = () => {
          setConnectionState('connecting');
          subscriptionRef.current = subscribeToSnapshots(
            cpId,
            (newSnapshot: StationSnapshot) => {
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
                setInternalState('ready');
              }
            },
            (newState: RealtimeConnectionState) => {
              if (!active) return;
              console.log(`[useStationData] Connection state changed to: ${newState}`);

              if (newState === 'connected') {
                // Reset reconnection manager on successful connection
                reconnectionManagerRef.current.reset();
                setConnectionState('connected');
              } else if (newState === 'error' || newState === 'disconnected') {
                // Schedule reconnection attempt
                setConnectionState('reconnecting');
                const scheduled = reconnectionManagerRef.current.scheduleReconnect(() => {
                  if (!active) return;
                  console.log(`[useStationData] Attempting reconnection for ${cpId}`);
                  subscriptionRef.current?.unsubscribe();
                  createSubscription();
                });

                if (!scheduled) {
                  // Max attempts reached
                  setConnectionState('error');
                }
              } else {
                setConnectionState(newState);
              }
            }
          );
        };

        // Subscribe to realtime immediately (not after load)
        createSubscription();
        unsubscribe = () => subscriptionRef.current?.unsubscribe();

        // Check if snapshot is fresh
        const stale = isDataStale(snapshot?.created_at ?? null, ttlMinutes);

        if (snapshot && !stale && !cpIdChanged) {
          // Fresh data available from cache (skip on station switch to trigger on-demand scrape)
          console.log(`[useStationData] Using fresh cache for ${cpId}`);
          const chargerStatus = snapshotToChargerStatus(snapshot, metadataRef.current ?? undefined);
          currentDataTimestampRef.current = new Date(snapshot.created_at).getTime();
          setData(chargerStatus);
          setInternalState('ready');
        } else if (cuprId !== undefined) {
          // Stale or missing - check rate limit cache first
          if (isStationRateLimited(cuprId)) {
            // Rate limited - use stale cache if available
            console.log(`[useStationData] Rate limited for ${cpId}, using cache`);
            if (snapshot) {
              const chargerStatus = snapshotToChargerStatus(
                snapshot,
                metadataRef.current ?? undefined
              );
              currentDataTimestampRef.current = new Date(snapshot.created_at).getTime();
              setData(chargerStatus);
              setInternalState('ready');
              setIsRateLimitedState(true);
            } else {
              setError('Data unavailable (rate limited)');
              setInternalState('error');
            }
          } else {
            // Fetch from Edge via poll-station
            console.log(
              `[useStationData] Cache ${stale ? 'stale' : 'missing'} for ${cpId}, fetching from Edge`
            );
            setInternalState('loading_api');

            const result = await pollStation(cuprId);

            if (!active) return;

            if (isApiSuccess(result)) {
              const chargerStatus = pollDataToChargerStatus(
                result.data,
                metadataRef.current ?? undefined
              );
              currentDataTimestampRef.current = new Date(result.data.observed_at).getTime();
              setData(chargerStatus);
              setInternalState('ready');
              setIsRateLimitedState(false);
              setNextPollIn(null);
            } else if (isRateLimited(result)) {
              // Rate limited - mark in cache and use stale data
              const retryAfter = result.error.retry_after ?? 300;
              markRateLimited(cuprId, retryAfter);
              console.log(`[useStationData] Rate limited for ${cpId}, retry after ${retryAfter}s`);

              if (snapshot) {
                const chargerStatus = snapshotToChargerStatus(
                  snapshot,
                  metadataRef.current ?? undefined
                );
                currentDataTimestampRef.current = new Date(snapshot.created_at).getTime();
                setData(chargerStatus);
                setInternalState('ready');
                setIsRateLimitedState(true);
                setNextPollIn(retryAfter);
              } else {
                setError('Data unavailable (rate limited)');
                setInternalState('error');
              }
            } else {
              // Other API error - try to use stale cache as fallback
              console.log(
                `[useStationData] API error for ${cpId}: ${result.error.code}, using cache fallback`
              );

              if (snapshot) {
                // Use stale cache with indicator
                const chargerStatus = snapshotToChargerStatus(
                  snapshot,
                  metadataRef.current ?? undefined
                );
                currentDataTimestampRef.current = new Date(snapshot.created_at).getTime();
                setData(chargerStatus);
                setInternalState('ready');
              } else {
                // No cache available, show API error message
                setError(result.error.message);
                setInternalState('error');
              }
            }
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

    // Copy ref value for cleanup to avoid stale ref warning
    const reconnectionManager = reconnectionManagerRef.current;

    return () => {
      active = false;
      unsubscribe?.();
      reconnectionManager.cancelPending();
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
      connectionState: 'disconnected',
      hasRealtime: false,
      isStale: false,
      isRateLimited: false,
      nextPollIn: null,
    };
  }

  // Derive hasRealtime for backwards compatibility
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
  };
}

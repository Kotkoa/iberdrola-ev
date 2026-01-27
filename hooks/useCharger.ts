import { useEffect, useState, useRef } from 'react';
import {
  getLatestSnapshot,
  getStationMetadata,
  subscribeToSnapshots,
  snapshotToChargerStatus,
  type StationSnapshot,
  type StationMetadata,
} from '../api/charger.js';
import type { ChargerStatus } from '../types/charger';

/**
 * @deprecated This hook will be replaced by useStationData for TTL-based freshness.
 * Kept for backward compatibility during Phase 4 rollout.
 *
 * New code should use useStationData instead.
 *
 * **Differences from useStationData:**
 * - No TTL check (uses any data from Supabase, even if stale)
 * - Subscription starts after initial load (not immediately)
 * - No state machine (uses loading boolean)
 * - Null-based fallback (not TTL-based)
 *
 * **Migration guide:**
 * ```typescript
 * // Old:
 * const { data, loading, error } = useCharger(cpId);
 *
 * // New:
 * const { state, data, error, hasRealtime, isStale } = useStationData(cpId, cuprId);
 * const loading = state === 'loading_cache' || state === 'loading_api';
 * ```
 */
export function useCharger(cpId?: number | null) {
  const [data, setData] = useState<ChargerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const metadataRef = useRef<StationMetadata | null>(null);
  const prevCpIdRef = useRef<number | null | undefined>(cpId);

  const cpIdChanged = prevCpIdRef.current !== cpId;
  if (cpIdChanged) {
    prevCpIdRef.current = cpId;
  }

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    const load = async () => {
      if (cpId === null || cpId === undefined) {
        setData(null);
        setLoading(false);
        setError(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const [snapshot, metadata] = await Promise.all([
          getLatestSnapshot(cpId),
          getStationMetadata(cpId),
        ]);

        metadataRef.current = metadata;

        if (active) {
          if (snapshot) {
            const chargerStatus = snapshotToChargerStatus(snapshot, {
              cp_name: metadata?.address_full?.split(',')[0] || 'Unknown',
              cp_latitude: metadata?.latitude ?? undefined,
              cp_longitude: metadata?.longitude ?? undefined,
              address_full: metadata?.address_full ?? undefined,
            });
            setData(chargerStatus);
          } else {
            setData(null);
          }
        }

        unsubscribe = subscribeToSnapshots(cpId, (newSnapshot: StationSnapshot) => {
          if (active) {
            const meta = metadataRef.current;
            const chargerStatus = snapshotToChargerStatus(newSnapshot, {
              cp_name: meta?.address_full?.split(',')[0] || 'Unknown',
              cp_latitude: meta?.latitude ?? undefined,
              cp_longitude: meta?.longitude ?? undefined,
              address_full: meta?.address_full ?? undefined,
            });
            setData(chargerStatus);
          }
        });
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'Unknown error');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [cpId]);

  const isLoadingDuringTransition = cpIdChanged && cpId !== null && cpId !== undefined;

  return {
    data: isLoadingDuringTransition ? null : data,
    loading: isLoadingDuringTransition || loading,
    error: isLoadingDuringTransition ? null : error,
  };
}

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  getUserLocation,
  fetchStationsPartial,
  enrichStationDetails,
  type StationInfoPartial,
} from '../services/iberdrola';
import {
  saveSnapshot,
  detailsToSnapshotData,
  getStationsFromCache,
  CACHE_TTL_MINUTES,
} from '../services/stationApi';
import { fetchStationDetails } from '../services/iberdrola';
import { shouldSaveStationToCache } from '../utils/station';

const CONCURRENCY_LIMIT = 5;

export interface SearchProgress {
  current: number;
  total: number;
}

export interface UseStationSearchReturn {
  stations: StationInfoPartial[];
  loading: boolean;
  enriching: boolean;
  progress: SearchProgress;
  error: string | null;
  search: (radius: number) => Promise<void>;
  clear: () => void;
}

export function useStationSearch(): UseStationSearchReturn {
  const [stations, setStations] = useState<StationInfoPartial[]>([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress>({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = useCallback(async (radius: number) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      setEnriching(false);
      setError(null);
      setStations([]);
      setProgress({ current: 0, total: 0 });

      const pos = await getUserLocation();
      if (controller.signal.aborted) return;

      const partialResults = await fetchStationsPartial(
        pos.coords.latitude,
        pos.coords.longitude,
        radius
      );

      if (controller.signal.aborted) return;

      setStations(partialResults);
      setLoading(false);

      if (partialResults.length === 0) return;

      setEnriching(true);
      setProgress({ current: 0, total: partialResults.length });

      // Batch cache lookup for all stations (single database query)
      const allCpIds = partialResults.map((s) => s.cpId);
      let cachedMap = new Map();
      try {
        cachedMap = await getStationsFromCache(allCpIds, CACHE_TTL_MINUTES);
      } catch (cacheErr) {
        console.warn('Cache lookup failed, continuing with API enrichment:', cacheErr);
      }
      if (controller.signal.aborted) return;

      let completed = 0;

      const chunks: StationInfoPartial[][] = [];
      for (let i = 0; i < partialResults.length; i += CONCURRENCY_LIMIT) {
        chunks.push(partialResults.slice(i, i + CONCURRENCY_LIMIT));
      }

      for (const chunk of chunks) {
        if (controller.signal.aborted) break;

        const enrichedChunk = await Promise.all(
          chunk.map(async (station) => {
            if (controller.signal.aborted) return station;

            const enriched = await enrichStationDetails(station, cachedMap);
            completed++;

            if (!controller.signal.aborted) {
              setProgress({ current: completed, total: partialResults.length });
            }

            if (shouldSaveStationToCache(enriched.priceKwh)) {
              fetchStationDetails(station.cuprId)
                .then((details) => {
                  if (details && !controller.signal.aborted) {
                    saveSnapshot({
                      cpId: station.cpId,
                      cuprId: station.cuprId,
                      source: 'user_nearby',
                      stationData: detailsToSnapshotData(details),
                    }).catch((err) => console.error('Failed to save snapshot:', err));
                  }
                })
                .catch(() => {});
            }

            return enriched;
          })
        );

        if (controller.signal.aborted) break;

        setStations((prev) => {
          const updated = [...prev];
          for (const enriched of enrichedChunk) {
            const idx = updated.findIndex((s) => s.cpId === enriched.cpId);
            if (idx !== -1) {
              updated[idx] = enriched;
            }
          }
          return updated;
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;

      const errorMsg =
        err instanceof GeolocationPositionError
          ? 'Location access denied'
          : err instanceof Error
            ? err.message
            : 'Search failed';
      setError(errorMsg);
    } finally {
      if (!controller.signal.aborted) {
        setProgress({ current: 0, total: 0 });
        setLoading(false);
        setEnriching(false);
      }
    }
  }, []);

  const clear = useCallback(() => {
    abortControllerRef.current?.abort();
    setStations([]);
    setError(null);
    setEnriching(false);
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    stations,
    loading,
    enriching,
    progress,
    error,
    search,
    clear,
  };
}

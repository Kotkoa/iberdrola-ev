import { useState, useCallback, useRef, useEffect } from 'react';
import {
  getUserLocation,
  findNearestFreeStations,
  fetchStationDetails,
  type StationInfo,
} from '../services/iberdrola';
import { saveSnapshot, detailsToSnapshotData } from '../services/stationApi';

export interface SearchProgress {
  current: number;
  total: number;
}

export interface UseStationSearchReturn {
  stations: StationInfo[];
  loading: boolean;
  progress: SearchProgress;
  error: string | null;
  search: (radius: number) => Promise<void>;
  clear: () => void;
}

export function useStationSearch(): UseStationSearchReturn {
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<SearchProgress>({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = useCallback(async (radius: number) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      setError(null);
      setStations([]);
      setProgress({ current: 0, total: 0 });

      const pos = await getUserLocation();

      const results = await findNearestFreeStations(
        pos.coords.latitude,
        pos.coords.longitude,
        radius,
        (current, total) => {
          if (!controller.signal.aborted) {
            setProgress({ current, total });
          }
        },
        controller.signal
      );

      if (controller.signal.aborted) return;

      setStations(results);

      for (const station of results) {
        if (controller.signal.aborted) break;
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
          .catch((err) => console.error('Failed to fetch details for saving:', err));
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
      }
    }
  }, []);

  const clear = useCallback(() => {
    abortControllerRef.current?.abort();
    setStations([]);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    stations,
    loading,
    progress,
    error,
    search,
    clear,
  };
}

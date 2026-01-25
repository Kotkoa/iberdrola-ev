import { useState, useCallback } from 'react';
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

  const search = useCallback(async (radius: number) => {
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
        (current, total) => setProgress({ current, total })
      );

      setStations(results);

      for (const station of results) {
        try {
          const details = await fetchStationDetails(station.cuprId);
          if (details) {
            saveSnapshot({
              cpId: station.cpId,
              cuprId: station.cuprId,
              source: 'user_nearby',
              stationData: detailsToSnapshotData(details),
            }).catch((err) => console.error('Failed to save snapshot:', err));
          }
        } catch (err) {
          console.error('Failed to fetch details for saving:', err);
        }
      }
    } catch (err) {
      const errorMsg =
        err instanceof GeolocationPositionError
          ? 'Location access denied'
          : err instanceof Error
            ? err.message
            : 'Search failed';
      setError(errorMsg);
    } finally {
      setProgress({ current: 0, total: 0 });
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setStations([]);
    setError(null);
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

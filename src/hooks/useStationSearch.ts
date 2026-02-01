import { useState, useCallback, useRef, useEffect } from 'react';
import { getUserLocation, type StationInfoPartial } from '../services/iberdrola';
import { searchNearby, isApiSuccess } from '../services/apiClient';
import { searchLocalStations } from '../services/localSearch';

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
  usingCachedData: boolean;
  scraperTriggered: boolean;
  search: (radius: number) => Promise<void>;
  clear: () => void;
}

export function useStationSearch(): UseStationSearchReturn {
  const [stations, setStations] = useState<StationInfoPartial[]>([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress>({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [scraperTriggered, setScraperTriggered] = useState(false);
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
      setUsingCachedData(false);
      setScraperTriggered(false);
      setProgress({ current: 0, total: 0 });

      const pos = await getUserLocation();
      if (controller.signal.aborted) return;

      // Use Edge Function (returns cache + triggers GitHub Action)
      console.log('[Search] Calling search-nearby Edge Function');
      const response = await searchNearby({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        radiusKm: radius,
      });

      if (controller.signal.aborted) return;

      if (isApiSuccess(response)) {
        // Convert response to StationInfoPartial format
        const results: StationInfoPartial[] = response.data.stations.map((s) => ({
          cpId: s.cpId,
          cuprId: s.cuprId,
          name: s.name,
          latitude: s.latitude,
          longitude: s.longitude,
          addressFull: s.addressFull,
          overallStatus: s.overallStatus || 'Unknown',
          totalPorts: s.totalPorts || 2,
          maxPower: s.maxPower ?? undefined,
          freePorts: s.freePorts ?? undefined,
          priceKwh: s.priceKwh ?? undefined,
          socketType: s.socketType ?? undefined,
          _fromCache: true,
        }));

        setStations(results);
        setUsingCachedData(true);
        setScraperTriggered(response.meta.scraper_triggered);

        if (response.meta.scraper_triggered) {
          console.log('[Search] GitHub Action triggered, fresh data coming via Realtime');
        }

        if (results.length === 0) {
          setError('No stations found in this area.');
        }
      } else {
        // Edge Function failed - fallback to local search (no GitHub trigger)
        console.warn('[Search] Edge Function error, using local fallback:', response.error);

        const localResults = await searchLocalStations(
          pos.coords.latitude,
          pos.coords.longitude,
          radius,
          true
        );

        if (localResults.length > 0) {
          setStations(localResults);
          setUsingCachedData(true);
          setError('Live data unavailable. Showing cached results.');
        } else {
          setError(response.error.message);
        }
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
      setProgress({ current: 0, total: 0 });
      setLoading(false);
      setEnriching(false);
    }
  }, []);

  const clear = useCallback(() => {
    abortControllerRef.current?.abort();
    setStations([]);
    setError(null);
    setEnriching(false);
    setUsingCachedData(false);
    setScraperTriggered(false);
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
    usingCachedData,
    scraperTriggered,
    search,
    clear,
  };
}

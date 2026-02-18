import { useState, useCallback, useRef, useEffect } from 'react';
import { getUserLocation, type StationInfoPartial } from '../services/iberdrola';
import { searchNearby, isApiSuccess } from '../services/apiClient';
import { searchLocalStations } from '../services/localSearch';
import { DATA_FRESHNESS } from '../constants';

export interface UseStationSearchReturn {
  stations: StationInfoPartial[];
  loading: boolean;
  error: string | null;
  usingCachedData: boolean;
  scraperTriggered: boolean;
  search: (radius: number) => Promise<void>;
  clear: () => void;
}

export function useStationSearch(): UseStationSearchReturn {
  const [stations, setStations] = useState<StationInfoPartial[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingCachedData, setUsingCachedData] = useState(false);
  const [scraperTriggered, setScraperTriggered] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retryAbortRef = useRef<AbortController | null>(null);
  const lastSearchCoordsRef = useRef<{ lat: number; lon: number } | null>(null);
  const lastRadiusRef = useRef<number>(0);
  const retryCountRef = useRef(0);

  /**
   * Silent re-fetch using original search coordinates.
   * Does NOT clear stations or show loading — results update in place.
   */
  const silentRefetch = useCallback(async () => {
    const coords = lastSearchCoordsRef.current;
    const radius = lastRadiusRef.current;
    if (!coords) return;

    retryAbortRef.current?.abort();
    const controller = new AbortController();
    retryAbortRef.current = controller;

    try {
      console.log('[Search] Silent re-fetch with original coordinates');
      const response = await searchNearby({
        latitude: coords.lat,
        longitude: coords.lon,
        radiusKm: radius,
      });

      if (controller.signal.aborted) return;

      if (isApiSuccess(response)) {
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
        setScraperTriggered(false);

        if (results.length === 0) {
          setError('No stations found in this area.');
        }
      }
    } catch {
      // Silent retry — don't show errors
    }
  }, []);

  const search = useCallback(
    async (radius: number) => {
      // Cancel previous search + retry timer
      abortControllerRef.current?.abort();
      retryAbortRef.current?.abort();
      clearTimeout(retryTimerRef.current);
      retryCountRef.current = 0;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        setLoading(true);
        setError(null);
        setStations([]);
        setUsingCachedData(false);
        setScraperTriggered(false);

        const pos = await getUserLocation();
        if (controller.signal.aborted) return;

        // Store coordinates for silent retry
        lastSearchCoordsRef.current = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        };
        lastRadiusRef.current = radius;

        console.log('[Search] Calling search-nearby Edge Function');
        const response = await searchNearby({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          radiusKm: radius,
        });

        if (controller.signal.aborted) return;

        if (isApiSuccess(response)) {
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
            // Scraper dispatched — auto-retry after expected delay
            console.log('[Search] GitHub Action triggered, auto-retry in 25s');
            retryTimerRef.current = setTimeout(
              silentRefetch,
              DATA_FRESHNESS.SCRAPER_EXPECTED_DELAY_MS
            );
          } else if (response.meta.retry_after != null && retryCountRef.current === 0) {
            // Scraper on cooldown — data may already be fresher, try one immediate re-fetch
            console.log('[Search] Scraper on cooldown, one immediate re-fetch');
            retryCountRef.current = 1;
            retryTimerRef.current = setTimeout(silentRefetch, 0);
          }

          if (results.length === 0) {
            setError('No stations found in this area.');
          }
        } else {
          // Edge Function failed — fallback to local search
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
        setLoading(false);
      }
    },
    [silentRefetch]
  );

  const clear = useCallback(() => {
    abortControllerRef.current?.abort();
    retryAbortRef.current?.abort();
    clearTimeout(retryTimerRef.current);
    setStations([]);
    setError(null);
    setUsingCachedData(false);
    setScraperTriggered(false);
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      retryAbortRef.current?.abort();
      clearTimeout(retryTimerRef.current);
    };
  }, []);

  return {
    stations,
    loading,
    error,
    usingCachedData,
    scraperTriggered,
    search,
    clear,
  };
}

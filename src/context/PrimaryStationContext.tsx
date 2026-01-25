/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useCharger } from '../../hooks/useCharger';
import {
  getPrimaryStation,
  setPrimaryStation as saveToStorage,
  clearPrimaryStation as clearFromStorage,
  type PrimaryStationData,
} from '../services/localStorage';
import { fetchStationViaEdge } from '../services/stationApi';
import type { ChargerStatusFromApi } from '../services/iberdrola';
import type { ChargerStatus } from '../../types/charger';

interface ApiFetchResult {
  forCpId: number;
  data: ChargerStatusFromApi | null;
  error: string | null;
}

interface PrimaryStationContextValue {
  primaryStationId: number | null;
  primaryStation: ChargerStatus | null;
  loading: boolean;
  error: string | null;
  hasRealtime: boolean;
  setPrimaryStation: (cpId: number, cuprId: number) => void;
  clearPrimaryStation: () => void;
}

const PrimaryStationContext = createContext<PrimaryStationContextValue | null>(null);

interface PrimaryStationProviderProps {
  children: ReactNode;
}

export function PrimaryStationProvider({ children }: PrimaryStationProviderProps) {
  const [stationData, setStationData] = useState<PrimaryStationData | null>(() =>
    getPrimaryStation()
  );
  const [apiFetchResult, setApiFetchResult] = useState<ApiFetchResult | null>(null);
  const fetchIdRef = useRef(0);

  const {
    data: supabaseStation,
    loading: supabaseLoading,
    error: supabaseError,
  } = useCharger(stationData?.cpId ?? null);

  const shouldFetchFromApi =
    stationData !== null &&
    !supabaseLoading &&
    supabaseStation === null &&
    stationData.cuprId !== undefined;

  const hasRealtime = supabaseStation !== null;

  const hasFetchedForCurrentStation =
    apiFetchResult !== null && apiFetchResult.forCpId === stationData?.cpId;

  const apiFallbackLoading = shouldFetchFromApi && !hasFetchedForCurrentStation;
  const apiFallbackData = hasFetchedForCurrentStation ? apiFetchResult.data : null;
  const apiFallbackError = hasFetchedForCurrentStation ? apiFetchResult.error : null;

  const primaryStation: ChargerStatus | null = supabaseStation ?? apiFallbackData;
  const loading = supabaseLoading || apiFallbackLoading;
  const error = supabaseError ?? apiFallbackError;

  useEffect(() => {
    if (!shouldFetchFromApi || !stationData) return;
    if (hasFetchedForCurrentStation) return;

    const currentFetchId = ++fetchIdRef.current;
    const cpIdToFetch = stationData.cpId;

    fetchStationViaEdge(stationData.cpId, stationData.cuprId)
      .then((data) => {
        if (fetchIdRef.current !== currentFetchId) return;
        setApiFetchResult({
          forCpId: cpIdToFetch,
          data,
          error: data ? null : 'Station not found',
        });
      })
      .catch((err) => {
        if (fetchIdRef.current !== currentFetchId) return;
        setApiFetchResult({
          forCpId: cpIdToFetch,
          data: null,
          error: err instanceof Error ? err.message : 'Failed to fetch station',
        });
      });
  }, [shouldFetchFromApi, stationData, hasFetchedForCurrentStation]);

  const setPrimaryStation = useCallback((cpId: number, cuprId: number) => {
    saveToStorage(cpId, cuprId);
    setStationData({ cpId, cuprId });
    setApiFetchResult(null);
  }, []);

  const clearPrimaryStation = useCallback(() => {
    clearFromStorage();
    setStationData(null);
    setApiFetchResult(null);
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'iberdrola_primary_station') {
        setStationData(getPrimaryStation());
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const value: PrimaryStationContextValue = {
    primaryStationId: stationData?.cpId ?? null,
    primaryStation,
    loading,
    error,
    hasRealtime,
    setPrimaryStation,
    clearPrimaryStation,
  };

  return <PrimaryStationContext.Provider value={value}>{children}</PrimaryStationContext.Provider>;
}

export function usePrimaryStation(): PrimaryStationContextValue {
  const context = useContext(PrimaryStationContext);
  if (!context) {
    throw new Error('usePrimaryStation must be used within a PrimaryStationProvider');
  }
  return context;
}

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
import { useStationData } from '../../hooks/useStationData';
import {
  getPrimaryStation,
  setPrimaryStation as saveToStorage,
  clearPrimaryStation as clearFromStorage,
  type PrimaryStationData,
} from '../services/localStorage';
import { fetchStationViaEdge } from '../services/stationApi';
import type { ChargerStatusFromApi, StationInfoPartial } from '../services/iberdrola';
import type { ChargerStatus } from '../../types/charger';
import { CHARGING_POINT_STATUS } from '../constants';

// Feature flag for TTL-based freshness architecture
const USE_TTL_FRESHNESS = import.meta.env.VITE_USE_TTL_FRESHNESS === 'true';

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
  setPrimaryStation: (station: StationInfoPartial) => void;
  clearPrimaryStation: () => void;
}

const PrimaryStationContext = createContext<PrimaryStationContextValue | null>(null);

function stationPartialToChargerStatus(station: StationInfoPartial): ChargerStatus {
  const now = new Date().toISOString();
  return {
    id: `pending-${station.cpId}`,
    created_at: now,
    cp_id: station.cpId,
    cp_name: station.name,
    schedule: '24/7',
    port1_status:
      station.freePorts !== undefined && station.freePorts > 0
        ? CHARGING_POINT_STATUS.AVAILABLE
        : CHARGING_POINT_STATUS.BUSY,
    port2_status:
      station.freePorts !== undefined && station.freePorts > 1
        ? CHARGING_POINT_STATUS.AVAILABLE
        : null,
    port1_power_kw: station.maxPower ?? null,
    port1_update_date: now,
    port2_power_kw: station.maxPower ?? null,
    port2_update_date: now,
    overall_status: station.overallStatus,
    overall_update_date: now,
    cp_latitude: station.latitude,
    cp_longitude: station.longitude,
    address_full: station.addressFull,
    port1_price_kwh: station.priceKwh ?? 0,
    port2_price_kwh: station.priceKwh ?? 0,
    port1_socket_type: station.socketType ?? null,
    port2_socket_type: station.socketType ?? null,
    emergency_stop_pressed: station.emergencyStopPressed ?? false,
    situation_code: null,
  };
}

interface PrimaryStationProviderProps {
  children: ReactNode;
}

/**
 * Adapter for useStationData to match legacy interface
 * Converts state machine to loading boolean
 */
function useNewStationDataAdapter(stationData: PrimaryStationData | null) {
  const result = useStationData(stationData?.cpId ?? null, stationData?.cuprId, 5);

  return {
    data: result.data,
    loading: result.state === 'loading_cache' || result.state === 'loading_api',
    error: result.error,
    hasRealtime: result.hasRealtime,
  };
}

/**
 * Legacy station data loading (before TTL refactor)
 * Kept for rollback via feature flag
 *
 * Uses null-based fallback instead of TTL-based freshness check
 */
function useLegacyStationData(stationData: PrimaryStationData | null) {
  const [apiFetchResult, setApiFetchResult] = useState<ApiFetchResult | null>(null);
  const [pendingStationData, setPendingStationData] = useState<StationInfoPartial | null>(null);
  const fetchIdRef = useRef(0);

  const {
    data: supabaseStation,
    loading: supabaseLoading,
    error: supabaseError,
  } = useCharger(stationData?.cpId ?? null);

  const hasPendingData =
    pendingStationData !== null && pendingStationData.cpId === stationData?.cpId;

  const shouldFetchFromApi =
    stationData !== null &&
    !supabaseLoading &&
    supabaseStation === null &&
    !hasPendingData &&
    stationData.cuprId !== undefined;

  const hasRealtime = supabaseStation !== null;

  const hasFetchedForCurrentStation =
    apiFetchResult !== null && apiFetchResult.forCpId === stationData?.cpId;

  const apiFallbackLoading = shouldFetchFromApi && !hasFetchedForCurrentStation;
  const apiFallbackData = hasFetchedForCurrentStation ? apiFetchResult.data : null;
  const apiFallbackError = hasFetchedForCurrentStation ? apiFetchResult.error : null;

  const pendingChargerStatus =
    pendingStationData && pendingStationData.cpId === stationData?.cpId
      ? stationPartialToChargerStatus(pendingStationData)
      : null;

  const primaryStation: ChargerStatus | null =
    supabaseStation ?? pendingChargerStatus ?? apiFallbackData;
  const loading = supabaseLoading || apiFallbackLoading;
  const error = supabaseStation !== null ? null : (supabaseError ?? apiFallbackError);

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

  return {
    data: primaryStation,
    loading,
    error,
    hasRealtime,
    setPendingStationData,
    clearPendingData: () => setPendingStationData(null),
  };
}

export function PrimaryStationProvider({ children }: PrimaryStationProviderProps) {
  const [stationData, setStationData] = useState<PrimaryStationData | null>(() =>
    getPrimaryStation()
  );

  // Feature flag: use new or legacy implementation
  const newImplementation = useNewStationDataAdapter(stationData);
  const legacyImplementation = useLegacyStationData(stationData);

  // Choose implementation based on feature flag
  const {
    data: primaryStation,
    loading,
    error,
    hasRealtime,
  } = USE_TTL_FRESHNESS ? newImplementation : legacyImplementation;

  const legacyRef = useRef(legacyImplementation);

  // Update ref in effect to avoid updating during render
  useEffect(() => {
    legacyRef.current = legacyImplementation;
  });

  const setPrimaryStation = useCallback((station: StationInfoPartial) => {
    saveToStorage(station.cpId, station.cuprId);
    setStationData({ cpId: station.cpId, cuprId: station.cuprId });
    // Legacy implementation needs pending data
    if (!USE_TTL_FRESHNESS && legacyRef.current.setPendingStationData) {
      legacyRef.current.setPendingStationData(station);
    }
  }, []);

  const clearPrimaryStation = useCallback(() => {
    clearFromStorage();
    setStationData(null);
    // Legacy implementation needs to clear pending data
    if (!USE_TTL_FRESHNESS && legacyRef.current.clearPendingData) {
      legacyRef.current.clearPendingData();
    }
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

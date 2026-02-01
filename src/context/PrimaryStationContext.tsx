/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useStationData } from '../hooks/useStationData';
import {
  getPrimaryStation,
  setPrimaryStation as saveToStorage,
  clearPrimaryStation as clearFromStorage,
  type PrimaryStationData,
} from '../services/localStorage';
import type { StationInfoPartial } from '../services/iberdrola';
import type { ChargerStatus } from '../../types/charger';
import type { RealtimeConnectionState } from '../../types/realtime';

interface PrimaryStationContextValue {
  primaryStationId: number | null;
  /** CUPR ID for the primary station (used for API calls) */
  primaryStationCuprId: number | undefined;
  primaryStation: ChargerStatus | null;
  loading: boolean;
  error: string | null;
  /** WebSocket connection state for realtime updates */
  connectionState: RealtimeConnectionState;
  /**
   * Whether realtime subscription is active
   * @deprecated Use connectionState === 'connected' instead
   */
  hasRealtime: boolean;
  setPrimaryStation: (station: StationInfoPartial) => void;
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

  // Use TTL-based station data loading
  const {
    state,
    data: primaryStation,
    error,
    connectionState,
    hasRealtime,
  } = useStationData(
    stationData?.cpId ?? null,
    stationData?.cuprId,
    5 // TTL minutes
  );

  const loading = state === 'loading_cache' || state === 'loading_api';

  const setPrimaryStation = useCallback((station: StationInfoPartial) => {
    saveToStorage(station.cpId, station.cuprId);
    setStationData({ cpId: station.cpId, cuprId: station.cuprId });
  }, []);

  const clearPrimaryStation = useCallback(() => {
    clearFromStorage();
    setStationData(null);
  }, []);

  // Sync with localStorage changes from other tabs
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
    primaryStationCuprId: stationData?.cuprId,
    primaryStation,
    loading,
    error,
    connectionState,
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

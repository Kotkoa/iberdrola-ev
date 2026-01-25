import { useState, useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { usePrimaryStation } from '../../context/PrimaryStationContext';
import { StationEmptyState } from './StationEmptyState';
import { StationDetails } from './StationDetails';
import { PortsList } from '../PortsList';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { isPushSupported, isStandaloneApp, subscribeToStationNotifications } from '../../pwa';
import { formatDuration } from '../../utils/time';
import { calculateDistance } from '../../utils/maps';
import { useUserLocation } from '../../hooks/useUserLocation';
import { CHARGING_POINT_STATUS } from '../../constants';
import type { PortNumber, SubscriptionStatus } from '../../types';

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface StationTabProps {
  onNavigateToSearch: () => void;
}

export function StationTab({ onNavigateToSearch }: StationTabProps) {
  const { primaryStation, loading, error, primaryStationId, hasRealtime } = usePrimaryStation();
  const { location: userLocation } = useUserLocation();
  const [now, setNow] = useState(() => new Date());
  const [pushAvailable, setPushAvailable] = useState(() => isPushSupported());
  const [isStandalone, setIsStandalone] = useState(() => isStandaloneApp());
  const [subscriptionState, setSubscriptionState] = useState<
    Record<PortNumber, SubscriptionStatus>
  >({
    1: 'idle',
    2: 'idle',
  });
  const [subscriptionErrors, setSubscriptionErrors] = useState<Record<PortNumber, string | null>>({
    1: null,
    2: null,
  });

  const VITE_CHECK_SUB_URL = import.meta.env.VITE_CHECK_SUB_URL;

  const restoreSubscriptionState = useCallback(
    async (stationId: number) => {
      if (!isPushSupported()) return;

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();

      if (!existing) return;

      const res = await fetch(`${VITE_CHECK_SUB_URL}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(SUPABASE_ANON_KEY && {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          }),
        },
        body: JSON.stringify({
          stationId: String(stationId),
          endpoint: existing.endpoint,
        }),
      });

      if (!res.ok) return;

      const data = await res.json();
      const ports: number[] = data.ports ?? [];

      setSubscriptionState(() => ({
        1: ports.includes(1) ? 'success' : 'idle',
        2: ports.includes(2) ? 'success' : 'idle',
      }));
    },
    [VITE_CHECK_SUB_URL]
  );

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!primaryStation) return;
    restoreSubscriptionState(primaryStation.cp_id);
  }, [primaryStation, restoreSubscriptionState]);

  useEffect(() => {
    setPushAvailable(isPushSupported());
    setIsStandalone(isStandaloneApp());

    const mediaQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;

    if (!mediaQuery) return;

    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches);
    };

    mediaQuery.addEventListener('change', handleDisplayModeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const handleSubscribeClick = useCallback(
    async (portNumber: PortNumber) => {
      if (!primaryStation) return;
      setSubscriptionErrors((prev) => ({ ...prev, [portNumber]: null }));
      setSubscriptionState((prev) => ({ ...prev, [portNumber]: 'loading' }));
      try {
        await subscribeToStationNotifications(primaryStation.cp_id, portNumber);
        setSubscriptionState((prev) => ({ ...prev, [portNumber]: 'success' }));
      } catch (err) {
        setSubscriptionState((prev) => ({ ...prev, [portNumber]: 'error' }));
        setSubscriptionErrors((prev) => ({
          ...prev,
          [portNumber]: err instanceof Error ? err.message : 'Subscribing failed',
        }));
      }
    },
    [primaryStation]
  );

  if (primaryStationId === null) {
    return <StationEmptyState onNavigateToSearch={onNavigateToSearch} />;
  }

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!primaryStation) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Station not found</Typography>
      </Box>
    );
  }

  const port1Update = primaryStation.port1_update_date
    ? new Date(primaryStation.port1_update_date)
    : null;
  const port2Update = primaryStation.port2_update_date
    ? new Date(primaryStation.port2_update_date)
    : null;

  const port1DurationMinutes = port1Update
    ? Math.floor((now.getTime() - port1Update.getTime()) / 60000)
    : null;
  const port2DurationMinutes = port2Update
    ? Math.floor((now.getTime() - port2Update.getTime()) / 60000)
    : null;

  const isFirstPortAvailable = primaryStation.port1_status === CHARGING_POINT_STATUS.AVAILABLE;
  const isSecondPortAvailable = primaryStation.port2_status === CHARGING_POINT_STATUS.AVAILABLE;
  const availableCount = (isFirstPortAvailable ? 1 : 0) + (isSecondPortAvailable ? 1 : 0);

  const portConfigs = [
    {
      portNumber: 1 as const,
      isAvailable: isFirstPortAvailable,
      busyDuration: !isFirstPortAvailable ? formatDuration(port1DurationMinutes) : null,
      powerKw: primaryStation.port1_power_kw,
      priceKwh: primaryStation.port1_price_kwh,
      socketType: primaryStation.port1_socket_type,
    },
    {
      portNumber: 2 as const,
      isAvailable: isSecondPortAvailable,
      busyDuration: !isSecondPortAvailable ? formatDuration(port2DurationMinutes) : null,
      powerKw: primaryStation.port2_power_kw,
      priceKwh: primaryStation.port2_price_kwh,
      socketType: primaryStation.port2_socket_type,
    },
  ];

  const distanceKm =
    userLocation && primaryStation.cp_latitude && primaryStation.cp_longitude
      ? calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          primaryStation.cp_latitude,
          primaryStation.cp_longitude
        )
      : null;

  return (
    <Box>
      <StationDetails
        cpId={primaryStation.cp_id}
        cpName={primaryStation.cp_name}
        schedule={primaryStation.schedule}
        availableCount={availableCount}
        addressFull={primaryStation.address_full}
        emergencyStopPressed={primaryStation.emergency_stop_pressed}
        situationCode={primaryStation.situation_code}
        latitude={primaryStation.cp_latitude}
        longitude={primaryStation.cp_longitude}
        distanceKm={distanceKm}
        hasRealtime={hasRealtime}
      />

      <PortsList
        portConfigs={portConfigs}
        subscriptionState={subscriptionState}
        subscriptionErrors={subscriptionErrors}
        pushAvailable={pushAvailable}
        isStandalone={isStandalone}
        onSubscribeClick={handleSubscribeClick}
      />
    </Box>
  );
}

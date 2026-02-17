import { useState, useCallback, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { usePrimaryStation } from '../../context/PrimaryStationContext';
import { StationEmptyState } from './StationEmptyState';
import { StationDetails } from './StationDetails';
import { PortsList } from '../PortsList';
import { LoadingSkeleton } from '../LoadingSkeleton';
import { isPushSupported, subscribeWithWatch } from '../../pwa';
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
  const {
    primaryStation,
    loading,
    error,
    primaryStationId,
    primaryStationCuprId,
    connectionState,
  } = usePrimaryStation();
  const { location: userLocation } = useUserLocation();
  const [now, setNow] = useState(() => new Date());
  const [pushAvailable, setPushAvailable] = useState(() => isPushSupported());
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

  // Debounce for subscription button clicks
  const DEBOUNCE_MS = 2000;
  const lastSubscribeTimeRef = useRef<Record<PortNumber, number>>({ 1: 0, 2: 0 });

  const VITE_CHECK_SUB_URL = import.meta.env.VITE_CHECK_SUB_URL;

  const restoreSubscriptionState = useCallback(
    async (stationId: number) => {
      if (!isPushSupported()) return;
      if (!VITE_CHECK_SUB_URL) {
        console.warn('VITE_CHECK_SUB_URL is not configured');
        return;
      }

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
      const ports: number[] = data.subscribedPorts ?? [];

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

  // Reset subscription state when a push notification is received
  useEffect(() => {
    if (!primaryStation || !('serviceWorker' in navigator)) return;

    const handleSwMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (
        typeof data === 'object' &&
        data !== null &&
        'type' in data &&
        (data as { type: string }).type === 'PUSH_RECEIVED'
      ) {
        const msg = data as { stationId?: string; portNumber?: number };
        if (String(msg.stationId) !== String(primaryStation.cp_id)) return;
        const port = msg.portNumber;
        if (port === 1 || port === 2) {
          setSubscriptionState((prev) => ({ ...prev, [port]: 'idle' }));
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [primaryStation]);

  useEffect(() => {
    setPushAvailable(isPushSupported());
  }, []);

  const handleSubscribeClick = useCallback(
    async (portNumber: PortNumber) => {
      if (!primaryStation || !primaryStationCuprId) return;

      // Debounce check
      const now = Date.now();
      if (now - lastSubscribeTimeRef.current[portNumber] < DEBOUNCE_MS) {
        console.log(`[StationTab] Subscription click debounced for port ${portNumber}`);
        return;
      }
      lastSubscribeTimeRef.current[portNumber] = now;

      setSubscriptionErrors((prev) => ({ ...prev, [portNumber]: null }));
      setSubscriptionState((prev) => ({ ...prev, [portNumber]: 'loading' }));
      try {
        const result = await subscribeWithWatch(primaryStationCuprId, portNumber);
        console.log(
          `[StationTab] Subscription created: id=${result.subscriptionId}, fresh=${result.fresh}`
        );
        setSubscriptionState((prev) => ({ ...prev, [portNumber]: 'success' }));
      } catch (err) {
        setSubscriptionState((prev) => ({ ...prev, [portNumber]: 'error' }));
        setSubscriptionErrors((prev) => ({
          ...prev,
          [portNumber]: err instanceof Error ? err.message : 'Subscribing failed',
        }));
      }
    },
    [primaryStation, primaryStationCuprId]
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
        connectionState={connectionState}
      />

      <PortsList
        portConfigs={portConfigs}
        subscriptionState={subscriptionState}
        subscriptionErrors={subscriptionErrors}
        pushAvailable={pushAvailable}
        onSubscribeClick={handleSubscribeClick}
      />
    </Box>
  );
}

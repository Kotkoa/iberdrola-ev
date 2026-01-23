import './App.css';

import { useEffect, useState, useCallback } from 'react';
import Container from '@mui/material/Container';
import Copyright from './components/Copyright';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { ErrorState } from './components/ErrorState';
import { EmptyState } from './components/EmptyState';
import { ChargingStationInfo } from './components/ChargingStationInfo';
import { PortsList } from './components/PortsList';
import { useCharger } from '../hooks/useCharger';
import { generateGoogleMapsUrl } from './utils/maps';
import { formatDuration } from './utils/time';
import { DEFAULT_CHARGING_POINT } from './constants';
import { isPushSupported, isStandaloneApp, subscribeToStationNotifications } from './pwa';
import { GetNearestChargingPointsButton } from './features/get-nearest-charging-points/GetNearestChargingPointsButton';
import type { PortNumber, SubscriptionStatus } from './types';

function App() {
  const { data: charger, loading, error } = useCharger();
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: String(stationId),
          endpoint: existing.endpoint,
        }),
      });

      const { ports } = await res.json();

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
    if (!charger) return;
    restoreSubscriptionState(charger.cp_id);
  }, [charger, restoreSubscriptionState]);

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
      if (!charger) return;
      setSubscriptionErrors((prev) => ({ ...prev, [portNumber]: null }));
      setSubscriptionState((prev) => ({ ...prev, [portNumber]: 'loading' }));
      try {
        await subscribeToStationNotifications(charger.cp_id, portNumber);
        setSubscriptionState((prev) => ({ ...prev, [portNumber]: 'success' }));
      } catch (err) {
        setSubscriptionState((prev) => ({ ...prev, [portNumber]: 'error' }));
        setSubscriptionErrors((prev) => ({
          ...prev,
          [portNumber]: err instanceof Error ? err.message : 'Subscribing failed',
        }));
      }
    },
    [charger]
  );

  const cp_latitude = DEFAULT_CHARGING_POINT.LATITUDE;
  const cp_longitude = DEFAULT_CHARGING_POINT.LONGITUDE;

  const handleShowOnMap = useCallback(() => {
    if (!cp_latitude || !cp_longitude) return;
    const mapsUrl = generateGoogleMapsUrl(cp_latitude, cp_longitude, 15);
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  }, [cp_latitude, cp_longitude]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!charger) {
    return <EmptyState />;
  }

  const port1Update = charger.port1_update_date ? new Date(charger.port1_update_date) : null;
  const port2Update = charger.port2_update_date ? new Date(charger.port2_update_date) : null;

  const port1DurationMinutes = port1Update
    ? Math.floor((now.getTime() - port1Update.getTime()) / 60000)
    : null;
  const port2DurationMinutes = port2Update
    ? Math.floor((now.getTime() - port2Update.getTime()) / 60000)
    : null;

  const isFirstPortAvailable = charger.port1_status === 'AVAILABLE';
  const isSecondPortAvailable = charger.port2_status === 'AVAILABLE';
  const availableCount = (isFirstPortAvailable ? 1 : 0) + (isSecondPortAvailable ? 1 : 0);

  const portConfigs = [
    {
      portNumber: 1 as const,
      isAvailable: isFirstPortAvailable,
      busyDuration: !isFirstPortAvailable ? formatDuration(port1DurationMinutes) : null,
      powerKw: charger.port1_power_kw,
    },
    {
      portNumber: 2 as const,
      isAvailable: isSecondPortAvailable,
      busyDuration: !isSecondPortAvailable ? formatDuration(port2DurationMinutes) : null,
      powerKw: charger.port2_power_kw,
    },
  ];

  return (
    <Container
      maxWidth="sm"
      className="rounded-xl border border-gray-200 bg-white py-4 shadow-md"
      sx={{
        px: { xs: 2, sm: 3 },
        maxWidth: { xs: '100vw', sm: '600px' },
        width: '100%',
      }}
    >
      <ChargingStationInfo
        cpId={charger.cp_id}
        cpName={charger.cp_name}
        schedule={charger.schedule}
        availableCount={availableCount}
        onShowOnMap={handleShowOnMap}
        hasCoordinates={Boolean(cp_latitude && cp_longitude)}
      />

      <PortsList
        portConfigs={portConfigs}
        subscriptionState={subscriptionState}
        subscriptionErrors={subscriptionErrors}
        pushAvailable={pushAvailable}
        isStandalone={isStandalone}
        onSubscribeClick={handleSubscribeClick}
      />

      {isStandalone && <GetNearestChargingPointsButton />}
      <Copyright />
    </Container>
  );
}

export default App;

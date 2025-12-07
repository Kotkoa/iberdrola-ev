import './App.css'

import { useEffect, useState, useCallback } from 'react'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Chip from '@mui/material/Chip'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import DirectionsIcon from '@mui/icons-material/Directions'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Copyright from './components/Copyright'
import { PortCard } from './components/PortCard'
import { useCharger } from '../hooks/useCharger'
import {
  isPushSupported,
  isStandaloneApp,
  subscribeToStationNotifications,
} from './pwa'
import { GetNearestChargingPointsButton } from './features/get-nearest-charging-points/GetNearestChargingPointsButton'

const formatDuration = (durationMinutes: number | null) => {
  if (durationMinutes === null) return null
  if (durationMinutes < 1) return '< 1 min'

  const hours = Math.floor(durationMinutes / 60)
  const minutes = durationMinutes % 60

  return hours > 0
    ? `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
    : `${minutes}m`
}

type PortNumber = 1 | 2

function App() {
  const { data: charger, loading, error } = useCharger()
  const [now, setNow] = useState(() => new Date())
  const [pushAvailable, setPushAvailable] = useState(() => isPushSupported())
  const [isStandalone, setIsStandalone] = useState(() => isStandaloneApp())
  const [subscriptionState, setSubscriptionState] = useState<
    Record<PortNumber, 'idle' | 'loading' | 'success' | 'error'>
  >({
    1: 'idle',
    2: 'idle',
  })
  const [subscriptionErrors, setSubscriptionErrors] = useState<
    Record<PortNumber, string | null>
  >({
    1: null,
    2: null,
  })

  const VITE_CHECK_SUB_URL = import.meta.env.VITE_CHECK_SUB_URL

  const restoreSubscriptionState = useCallback(
    async (stationId: number) => {
      if (!isPushSupported()) return

      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()

      if (!existing) return

      const res = await fetch(`${VITE_CHECK_SUB_URL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: String(stationId),
          endpoint: existing.endpoint,
        }),
      })

      const { ports } = await res.json()

      setSubscriptionState(() => ({
        1: ports.includes(1) ? 'success' : 'idle',
        2: ports.includes(2) ? 'success' : 'idle',
      }))
    },
    [VITE_CHECK_SUB_URL]
  )

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!charger) return
    restoreSubscriptionState(charger.cp_id)
  }, [charger, restoreSubscriptionState])

  useEffect(() => {
    setPushAvailable(isPushSupported())
    setIsStandalone(isStandaloneApp())

    const mediaQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null

    if (!mediaQuery) return

    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches)
    }

    mediaQuery.addEventListener('change', handleDisplayModeChange)

    return () => {
      mediaQuery.removeEventListener('change', handleDisplayModeChange)
    }
  }, [])

  const handleSubscribeClick = useCallback(
    async (portNumber: PortNumber) => {
      if (!charger) return
      setSubscriptionErrors((prev) => ({ ...prev, [portNumber]: null }))
      setSubscriptionState((prev) => ({ ...prev, [portNumber]: 'loading' }))
      try {
        await subscribeToStationNotifications(charger.cp_id, portNumber)
        setSubscriptionState((prev) => ({ ...prev, [portNumber]: 'success' }))
      } catch (err) {
        setSubscriptionState((prev) => ({ ...prev, [portNumber]: 'error' }))
        setSubscriptionErrors((prev) => ({
          ...prev,
          [portNumber]:
            err instanceof Error ? err.message : 'Subscribing failed',
        }))
      }
    },
    [charger]
  )

  const cp_latitude = 38.839266
  const cp_longitude = -0.120815

  const handleShowOnMap = useCallback(() => {
    if (!cp_latitude || !cp_longitude) return
    const mapsUrl = `https://www.google.com/maps?q=${cp_latitude},${cp_longitude}&z=15`
    window.open(mapsUrl, '_blank', 'noopener,noreferrer')
  }, [cp_latitude, cp_longitude])

  if (loading) {
    return (
      <Container
        maxWidth="sm"
        className="border border-gray-200 rounded-xl shadow-md bg-white"
      >
        <Box sx={{ m: 4 }}>
          <Stack alignItems="center" spacing={1} sx={{ my: 4 }}>
            <CircularProgress size={28} />
            <Typography variant="body2" color="textSecondary">
              Loading charging point...
            </Typography>
          </Stack>
        </Box>
      </Container>
    )
  }

  if (error) {
    return (
      <Container
        maxWidth="sm"
        className="border border-gray-200 rounded-xl shadow-md bg-white"
      >
        <Box sx={{ m: 4 }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>Failed to load data</AlertTitle>
            {error}
          </Alert>
        </Box>
      </Container>
    )
  }

  if (!charger) {
    return (
      <Container
        maxWidth="sm"
        className="border border-gray-200 rounded-xl shadow-md bg-white"
      >
        <Box sx={{ m: 4 }}>
          <Typography variant="body2" color="textSecondary">
            No data available.
          </Typography>
        </Box>
      </Container>
    )
  }

  const port1Update = charger.port1_update_date
    ? new Date(charger.port1_update_date)
    : null
  const port2Update = charger.port2_update_date
    ? new Date(charger.port2_update_date)
    : null

  const port1DurationMinutes = port1Update
    ? Math.floor((now.getTime() - port1Update.getTime()) / 60000)
    : null
  const port2DurationMinutes = port2Update
    ? Math.floor((now.getTime() - port2Update.getTime()) / 60000)
    : null

  const isFirstPortAvailable = charger.port1_status === 'AVAILABLE'
  const isSecondPortAvailable = charger.port2_status === 'AVAILABLE'
  const availableCount =
    (isFirstPortAvailable ? 1 : 0) + (isSecondPortAvailable ? 1 : 0)
  const portConfigs: Array<{
    portNumber: PortNumber
    isAvailable: boolean
    busyDuration: string | null
    powerKw: number | null
  }> = [
    {
      portNumber: 1 as const,
      isAvailable: isFirstPortAvailable,
      busyDuration: !isFirstPortAvailable
        ? formatDuration(port1DurationMinutes)
        : null,
      powerKw: charger.port1_power_kw,
    },
    {
      portNumber: 2 as const,
      isAvailable: isSecondPortAvailable,
      busyDuration: !isSecondPortAvailable
        ? formatDuration(port2DurationMinutes)
        : null,
      powerKw: charger.port2_power_kw,
    },
  ]

  return (
    <Container
      maxWidth="sm"
      className="border border-gray-200 rounded-xl shadow-md bg-white py-4"
      sx={{
        px: { xs: 2, sm: 3 },
        maxWidth: { xs: '100vw', sm: '600px' },
        width: '100%',
      }}
    >
      <Box
        sx={{
          textAlign: 'start',
          width: '100%',
          maxWidth: { xs: '100%', sm: '400px' },
        }}
      >
        <Typography
          variant="h5"
          component="h1"
          sx={{ mb: 1, fontSize: { xs: '1.1rem', sm: '1.5rem' } }}
          color={availableCount > 0 ? 'success' : 'warning'}
        >
          Available {availableCount}/2
        </Typography>

        <Stack direction="row" gap={0.5} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
          <Chip
            label="Iberdrola"
            color="default"
            variant="outlined"
            size="small"
            sx={{
              borderRadius: '4px',
              flexDirection: 'row-reverse',
              pr: 1,
              fontSize: { xs: '0.7rem', sm: '0.813rem' },
            }}
            avatar={
              <Avatar
                src="/iberdrola-logo.webp"
                alt="Iberdrola"
                sx={{ width: 16, height: 16 }}
                slotProps={{ img: { loading: 'lazy' } }}
              />
            }
          />
          <Chip
            label="Not reservable"
            color="default"
            variant="outlined"
            size="small"
            sx={{
              borderRadius: '4px',
              fontSize: { xs: '0.7rem', sm: '0.813rem' },
            }}
          />
          <Chip
            label={`ID.${charger.cp_id}`}
            color="default"
            variant="outlined"
            size="small"
            sx={{
              borderRadius: '4px',
              fontSize: { xs: '0.7rem', sm: '0.813rem' },
            }}
          />
        </Stack>

        <Typography
          variant="caption"
          color="textSecondary"
          sx={{ mt: 0.5, fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
        >
          PEGO, ALICANTE
        </Typography>
        <Typography
          variant="body1"
          color="textPrimary"
          fontWeight={600}
          sx={{ fontSize: { xs: '0.9rem', sm: '1rem' } }}
        >
          {charger.cp_name}
        </Typography>
        <Typography
          variant="caption"
          color="textSecondary"
          sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
        >
          Level: 0 / Spot: 1 / {charger.schedule}
        </Typography>

        <Stack sx={{ my: 1 }}>
          <Button
            onClick={handleShowOnMap}
            disabled={!cp_latitude || !cp_longitude}
            size="small"
            sx={{
              ml: 'auto',
              textTransform: 'none',
              fontSize: { xs: '0.7rem', sm: '0.875rem' },
            }}
            startIcon={<DirectionsIcon fontSize="small" />}
            variant="outlined"
            color="success"
          >
            Show on map
          </Button>
        </Stack>

        <Stack
          direction="row"
          alignItems="center"
          sx={{
            border: '1px solid #ccc',
            borderRadius: 2,
            mb: 1,
            px: 1,
            py: 0.5,
          }}
        >
          <InfoOutlinedIcon
            fontSize="small"
            sx={{ width: { xs: 16, sm: 20 }, height: { xs: 16, sm: 20 } }}
          />
          <Typography
            variant="body2"
            color="textPrimary"
            sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
          >
            Charging point with limited power
          </Typography>
        </Stack>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems="stretch"
          sx={{ mt: 1 }}
        >
          {portConfigs.map(
            ({ portNumber, isAvailable, busyDuration, powerKw }) => {
              const state = subscriptionState[portNumber]
              const errorMessage = subscriptionErrors[portNumber]
              const buttonLabel =
                state === 'success'
                  ? 'Notifications enabled'
                  : state === 'error'
                  ? 'Error enabling notifications'
                  : 'Notify me when free'

              return (
                <Box
                  key={portNumber}
                  sx={{
                    flex: 1,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                  }}
                >
                  <PortCard
                    portNumber={portNumber}
                    isAvailable={isAvailable}
                    busyDuration={busyDuration}
                    powerKw={powerKw}
                  />
                  {isStandalone && (
                    <>
                      <Button
                        variant="contained"
                        color="success"
                        disabled={
                          !pushAvailable ||
                          state === 'loading' ||
                          state === 'success'
                        }
                        onClick={() => handleSubscribeClick(portNumber)}
                        sx={{
                          textTransform: 'none',
                          fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        }}
                      >
                        {state === 'loading' ? 'Subscribing...' : buttonLabel}
                      </Button>
                      {state === 'success' && (
                        <Alert severity="success">
                          Notifications enabled for port {portNumber}.
                        </Alert>
                      )}
                      {state === 'error' && errorMessage && (
                        <Alert severity="warning">
                          <AlertTitle>Subscription error</AlertTitle>
                          {errorMessage}
                        </Alert>
                      )}
                    </>
                  )}
                </Box>
              )
            }
          )}
        </Stack>
        {isStandalone && !pushAvailable && (
          <Typography
            variant="caption"
            color="textSecondary"
            sx={{ display: 'block', mt: 1.5 }}
          >
            Push notifications are not supported in this browser.
          </Typography>
        )}
        {isStandalone && <GetNearestChargingPointsButton />}
        <Copyright />
      </Box>
    </Container>
  )
}

export default App

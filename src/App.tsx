import './App.css'

import { useEffect, useState } from 'react'
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
  subscribeToStationNotifications,
} from './pwa'

const formatDuration = (durationMinutes: number | null) => {
  if (durationMinutes === null) return null
  if (durationMinutes < 1) return '< 1 min'

  const hours = Math.floor(durationMinutes / 60)
  const minutes = durationMinutes % 60

  return hours > 0
    ? `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
    : `${minutes}m`
}

function App() {
  const { data: charger, loading, error } = useCharger()
  const [now, setNow] = useState(() => new Date())
  const [pushAvailable, setPushAvailable] = useState(() => isPushSupported())
  const [subscriptionState, setSubscriptionState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null)

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    setPushAvailable(isPushSupported())
  }, [])

  const handleSubscribeClick = async () => {
    if (!charger) return
    setSubscriptionError(null)
    setSubscriptionState('loading')
    try {
      await subscribeToStationNotifications(charger.cp_id)
      setSubscriptionState('success')
    } catch (err) {
      setSubscriptionState('error')
      setSubscriptionError(
        err instanceof Error ? err.message : 'Не удалось подписаться.'
      )
    }
  }

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
          <Chip
            label="Show on map"
            color="success"
            variant="outlined"
            size="small"
            sx={{
              borderRadius: '4px',
              flexDirection: 'row-reverse',
              pr: 0.5,
              ml: 'auto',
              fontSize: { xs: '0.7rem', sm: '0.875rem' },
            }}
            icon={<DirectionsIcon fontSize="small" />}
          />
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
          spacing={1}
          justifyContent="space-between"
          alignItems="center"
        >
          <PortCard
            portNumber={1}
            isAvailable={isFirstPortAvailable}
            busyDuration={
              !isFirstPortAvailable
                ? formatDuration(port1DurationMinutes)
                : null
            }
            powerKw={charger.port1_power_kw}
          />
          <PortCard
            portNumber={2}
            isAvailable={isSecondPortAvailable}
            busyDuration={
              !isSecondPortAvailable
                ? formatDuration(port2DurationMinutes)
                : null
            }
            powerKw={charger.port2_power_kw}
          />
        </Stack>

        <Box sx={{ mt: 2 }}>
          <Stack spacing={1}>
            <Button
              variant="contained"
              color="success"
              disabled={
                !pushAvailable ||
                subscriptionState === 'loading' ||
                subscriptionState === 'success'
              }
              onClick={handleSubscribeClick}
            >
              {subscriptionState === 'success'
                ? 'Subscription active'
                : 'Subscribe'}
            </Button>
            {!pushAvailable && (
              <Typography variant="caption" color="textSecondary">
                Push-unavailable in current browser. 
              </Typography>
            )}
            {subscriptionState === 'success' && (
              <Alert severity="success">
                <AlertTitle>Subscribed successfully</AlertTitle>
                You will receive notifications when the charging point status
                changes.
              </Alert>
            )}
            {subscriptionState === 'error' && subscriptionError && (
              <Alert severity="warning">
                <AlertTitle>Subscription failed</AlertTitle>
                {subscriptionError}
              </Alert>
            )}
          </Stack>
        </Box>

        <Copyright />
      </Box>
    </Container>
  )
}

export default App

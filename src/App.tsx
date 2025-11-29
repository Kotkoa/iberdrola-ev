import './App.css'
import { useEffect, useMemo, useState } from 'react'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Chip from '@mui/material/Chip'
import Avatar from '@mui/material/Avatar'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import DirectionsIcon from '@mui/icons-material/Directions'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Copyright from './components/Copyright'

type ApiResponse = {
  entidad: Array<{
    cpId: number
    cpStatus?: { statusCode?: string }
    locationData: {
      cuprName?: string
      cuprReservationIndicator?: boolean
      supplyPointData?: {
        cpAddress?: {
          streetName?: string
          streetNum?: string
          townName?: string
          regionName?: string
        }
      }
      level?: string
      number?: string
      scheduleType?: { scheduleTypeDesc?: string }
      operator?: { operatorDesc?: string }
    }
    logicalSocket: Array<{
      logicalSocketId: number
      chargeSpeedId?: number
      status?: { statusCode?: string }
      physicalSocket: Array<{
        physicalSocketId: number
        physicalSocketCode?: string
        maxPower?: number
        socketType?: { socketName?: string; socketTypeId?: string }
        appliedRate?: {
          recharge?: { price?: number }
        }
      }>
    }>
  }>
}

const connectorIcons: Record<string, string> = {
  '2': '/tipo-2.svg',
}

const chargeSpeedLabels: Record<number, string> = {
  1: 'Slow',
  2: 'Semi-fast',
  3: 'Fast',
  4: 'Ultra-fast',
}

const fetchStation = async (cuprId: number) => {
  const response = await fetch(
    'https://www.iberdrola.es/o/webclipb/iberdrola/puntosrecargacontroller/getDatosPuntoRecarga',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dto: { cuprId: [cuprId] },
        language: 'en',
      }),
    }
  )

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  const data = (await response.json()) as ApiResponse
  return data.entidad?.[0]
}

function App() {
  const [station, setStation] = useState<ApiResponse['entidad'][number] | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        const data = await fetchStation(144569)
        if (active) {
          setStation(data ?? null)
          setError(null)
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unknown error')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const logicalSockets = useMemo(
    () => station?.logicalSocket ?? [],
    [station]
  )
  const operatorName =
    station?.locationData.operator?.operatorDesc ?? 'Iberdrola'
  const reservationLabel = station?.locationData.cuprReservationIndicator
    ? 'Reservable'
    : 'Not reservable'
  const address = station?.locationData.supplyPointData?.cpAddress
  const streetLine = [address?.streetName, address?.streetNum]
    .filter(Boolean)
    .join(' ')
  const cityLine = [address?.townName, address?.regionName]
    .filter(Boolean)
    .join(', ')
  const level = station?.locationData.level ?? '-'
  const spot = station?.locationData.number ?? '-'
  const schedule = station?.locationData.scheduleType?.scheduleTypeDesc

  const statusSummary = useMemo(() => {
    const summary = { available: 0, total: logicalSockets.length }
    logicalSockets.forEach((socket) => {
      if (socket.status?.statusCode === 'AVAILABLE') {
        summary.available += 1
      }
    })
    return summary
  }, [logicalSockets])

  const getSpeedLabel = (chargeSpeedId?: number) =>
    (chargeSpeedId && chargeSpeedLabels[chargeSpeedId]) || 'Unknown speed'

  const getRateLabel = (price?: number) =>
    price && price > 0 ? `${price.toFixed(2)} €` : 'Free charging point'

  return (
    <Container
      maxWidth="sm"
      className="border border-gray-200 rounded-xl shadow-md"
    >
      <Box sx={{ m: 4, textAlign: 'start', width: '400px' }}>
        {loading && (
          <Stack alignItems="center" spacing={1} sx={{ my: 4 }}>
            <CircularProgress size={28} />
            <Typography variant="body2" color="textSecondary">
              Loading charging point...
            </Typography>
          </Stack>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>Failed to load data</AlertTitle>
            {error}
          </Alert>
        )}
        {station && (
          <>
            <Typography
              variant="h5"
              component="h1"
              sx={{ mb: 1 }}
              color={statusSummary.available > 0 ? 'success' : 'error'}
            >
              Available {statusSummary.available}/{statusSummary.total}
            </Typography>
            <Stack direction="row" gap={2}>
              <Chip
                label={operatorName}
                color="default"
                variant="outlined"
                size="small"
                sx={{
                  borderRadius: '4px',
                  flexDirection: 'row-reverse',
                  pr: 1,
                }}
                avatar={
                  <Avatar
                    src="/iberdrola-logo.webp"
                    alt="Iberdrola"
                    sx={{ width: 18, height: 18 }}
                    slotProps={{ img: { loading: 'lazy' } }}
                  />
                }
              />
              <Chip
                label={reservationLabel}
                color="default"
                variant="outlined"
                size="small"
                sx={{ borderRadius: '4px' }}
              />
            </Stack>
            <Typography variant="caption" color="textSecondary" sx={{ mt: 1 }}>
              {cityLine || 'Unknown location'}
            </Typography>
            <Typography variant="body1" color="textPrimary" fontWeight={600}>
              {station.locationData.cuprName || streetLine || 'Unnamed point'}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Level: {level} / Spot: {spot}
              {schedule ? ` · ${schedule}` : ''}
            </Typography>
            <Stack>
              <Chip
                label="Show on map"
                color="success"
                variant="outlined"
                size="small"
                sx={{
                  borderRadius: '4px',
                  flexDirection: 'row-reverse',
                  pr: 1,
                  ml: 'auto',
                }}
                icon={<DirectionsIcon fontSize="small" />}
              />
            </Stack>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{
                mt: 4,
                border: '1px solid #ccc',
                borderRadius: '4px',
                p: 2,
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <InfoOutlinedIcon fontSize="small" />
                <Typography variant="body2" color="textPrimary">
                  Charging point with limited power
                </Typography>
              </Stack>
              <Typography variant="caption" color="textSecondary">
                ID. {station.cpId}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              {logicalSockets.map((socket, idx) => {
                const physical = socket.physicalSocket[0]
                const iconSrc =
                  (physical?.socketType?.socketTypeId &&
                    connectorIcons[physical.socketType.socketTypeId]) ||
                  null
                return (
                  <Box
                    key={socket.logicalSocketId}
                    sx={{
                      border: 2,
                      borderColor: 'primary.main',
                      borderRadius: 2,
                      height: 140,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      flex: 1,
                    }}
                  >
                    <Box
                      sx={{
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        px: 2,
                        py: 0.5,
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{ lineHeight: 1.2, fontWeight: 600 }}
                      >
                        {getSpeedLabel(socket.chargeSpeedId)}
                      </Typography>
                      <Typography variant="caption" sx={{ lineHeight: 1.2 }}>
                        {getRateLabel(physical?.appliedRate?.recharge?.price)}
                      </Typography>
                    </Box>
                    <Stack direction="row" alignItems="center" height="100%">
                      <Box
                        sx={{
                          width: 25,
                          height: 25,
                          borderRadius: '50%',
                          bgcolor: 'grey.200',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          mx: 2,
                        }}
                      >
                        <Typography variant="subtitle2" fontWeight={600}>
                          {physical?.physicalSocketCode ?? idx + 1}
                        </Typography>
                      </Box>
                      <Stack
                        direction="row"
                        alignItems="center"
                        sx={{ mr: 2, ml: 'auto', textAlign: 'right' }}
                      >
                        {iconSrc && (
                          <Box
                            component="img"
                            src={iconSrc}
                            alt={
                              physical?.socketType?.socketName ?? 'Connector'
                            }
                            sx={{ width: 32, height: 32, mr: 1 }}
                          />
                        )}
                        <Box>
                          <Typography variant="body2" color="textSecondary">
                            {physical?.socketType?.socketName ?? 'Unknown type'}
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            {physical?.maxPower
                              ? `${physical.maxPower} kW`
                              : 'Power n/a'}
                          </Typography>
                        </Box>
                      </Stack>
                    </Stack>
                  </Box>
                )
              })}
            </Stack>
          </>
        )}
        {!loading && !station && !error && (
          <Typography variant="body2" color="textSecondary">
            No data available.
          </Typography>
        )}
        <Copyright />
      </Box>
    </Container>
  )
}

export default App

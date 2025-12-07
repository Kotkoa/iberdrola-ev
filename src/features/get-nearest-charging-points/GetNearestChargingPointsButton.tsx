import { useState } from 'react'
import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import RoomOutlinedIcon from '@mui/icons-material/RoomOutlined'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'

const IBERDROLA_URL =
  'https://corsproxy.io/?https://www.iberdrola.es/o/webclipb/iberdrola/puntosrecargacontroller/getListarPuntosRecarga'

interface PhysicalSocket {
  status?: { statusCode?: string }
  appliedRate?: {
    recharge?: {
      finalPrice?: number
    }
  }
  maxPower?: number
}

interface LogicalSocket {
  physicalSocket?: PhysicalSocket[]
}

interface StationDetails {
  cpStatus?: { statusCode?: string }
  logicalSocket?: LogicalSocket[]
  locationData?: {
    cuprName?: string
    latitude?: number
    longitude?: number
  }
}

interface StationListItem {
  cpId?: number
  locationData?: {
    cuprId?: number
  }
}

interface StationInfo {
  cpId: number
  name: string
  latitude: number
  longitude: number
  maxPower: number
  freePorts: number
}

const RADIUS_OPTIONS = [3, 5, 10, 15, 25, 40]

async function fetchDirect(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<StationListItem[]> {
  const latDelta = radiusKm / 111
  const lonDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180))

  const payload = {
    dto: {
      chargePointTypesCodes: ['P', 'R', 'I', 'N'],
      socketStatus: [],
      advantageous: false,
      connectorsType: ['2', '7'],
      loadSpeed: [],
      latitudeMax: lat + latDelta,
      latitudeMin: lat - latDelta,
      longitudeMax: lon + lonDelta,
      longitudeMin: lon - lonDelta,
    },
    language: 'en',
  }

  console.log('Search area:', {
    center: { lat, lon },
    radius: `${radiusKm}km`,
    bounds: {
      latMin: lat - latDelta,
      latMax: lat + latDelta,
      lonMin: lon - lonDelta,
      lonMax: lon + lonDelta,
    },
  })

  const res = await fetch(IBERDROLA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) throw new Error('Failed: ' + res.status)

  const data = await res.json()
  console.log('Stations found:', data.entidad?.length || 0)
  return data.entidad || []
}

async function fetchStationDetails(
  cuprId: number
): Promise<StationDetails | null> {
  const res = await fetch(
    'https://corsproxy.io/?https://www.iberdrola.es/o/webclipb/iberdrola/puntosrecargacontroller/getDatosPuntoRecarga',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ dto: { cuprId: [cuprId] }, language: 'en' }),
    }
  )

  if (!res.ok) throw new Error('Failed details: ' + res.status)

  const data = await res.json()
  return data.entidad?.[0] || null
}

function hasAvailablePorts(details: StationDetails | null): boolean {
  if (!details) return false

  if (details.cpStatus?.statusCode === 'AVAILABLE') return true

  return (
    details.logicalSocket?.some((socket) =>
      socket.physicalSocket?.some((ps) => ps.status?.statusCode === 'AVAILABLE')
    ) ?? false
  )
}

export function GetNearestChargingPointsButton() {
  const [stations, setStations] = useState<StationInfo[]>([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [loading, setLoading] = useState(false)
  const [radius, setRadius] = useState(5)
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  })

  const handleClick = async () => {
    try {
      setLoading(true)

      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        })
      })

      const lat = pos.coords.latitude
      const lon = pos.coords.longitude

      const result = await fetchDirect(lat, lon, radius)
      setProgress({ current: 0, total: result.length })

      const freeStations: StationInfo[] = []

      for (const s of result) {
        setProgress((p) => ({ ...p, current: p.current + 1 }))

        const cpId = s.cpId
        const cuprId = s.locationData?.cuprId

        if (!cpId || !cuprId) {
          continue
        }

        const details = await fetchStationDetails(cuprId)

        const hasAvailable = hasAvailablePorts(details)
        const isPaid =
          details?.logicalSocket?.some((sock) =>
            sock.physicalSocket?.some(
              (ps) =>
                ps.appliedRate?.recharge?.finalPrice &&
                ps.appliedRate.recharge.finalPrice > 0
            )
          ) ?? false

        if (!isPaid && hasAvailable) {
          const logical = details?.logicalSocket || []
          const flattened = logical.flatMap((ls) => ls.physicalSocket || [])
          const availableSockets = flattened.filter(
            (ps) => ps.status?.statusCode === 'AVAILABLE'
          )
          const freePorts = availableSockets.length
          const maxPower =
            flattened.reduce((acc, ps) => Math.max(acc, ps.maxPower || 0), 0) ||
            0

          freeStations.push({
            cpId: cpId,
            name: details?.locationData?.cuprName || 'Unknown',
            latitude: details?.locationData?.latitude || 0,
            longitude: details?.locationData?.longitude || 0,
            maxPower,
            freePorts,
          })
        }
      }

      setStations(freeStations)
    } catch (err) {
      console.error('Error:', err)
      const errorMsg =
        err instanceof GeolocationPositionError
          ? 'Location access denied'
          : err instanceof Error
          ? err.message
          : 'Request failed'

      setSnackbar({
        open: true,
        message: errorMsg,
        severity: 'error',
      })
    } finally {
      setProgress({ current: 0, total: 0 })
      setLoading(false)
    }
  }

  const handleClose = () => setSnackbar((prev) => ({ ...prev, open: false }))

  return (
    <>
      <Stack spacing={0.5} sx={{ mt: 2, mb: 3 }}>
        <Typography variant="subtitle2" color="textSecondary">
          Find charging stations near you
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <FormControl size="small" sx={{ minWidth: 90 }}>
            <Select
              value={radius}
              onChange={(e) => setRadius(e.target.value as number)}
              disabled={loading}
              sx={{
                height: '40px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {RADIUS_OPTIONS.map((r) => (
                <MenuItem key={r} value={r}>
                  {r} km
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            size="small"
            variant="outlined"
            color="success"
            onClick={handleClick}
            disabled={loading}
            startIcon={<RoomOutlinedIcon fontSize="small" />}
            loading={loading}
            sx={{
              height: '40px',
              textTransform: 'none',
              fontSize: { xs: '0.75rem', sm: '0.875rem' },
            }}
          >
            Find Stations
          </Button>
        </Stack>

        {progress.total > 0 && (
          <Typography variant="caption" sx={{ color: '#555' }}>
            Fetching details… {progress.current} / {progress.total}
          </Typography>
        )}

        {stations.length > 0 && !loading && (
          <Stack spacing={1} sx={{ mt: 1 }}>
            {stations.map((st) => (
              <Stack
                key={st.cpId}
                sx={{
                  p: 1,
                  border: '1px solid #c8e6c9',
                  borderRadius: 1,
                  background: '#f1f8f4',
                  color: '#333',
                }}
              >
                <Typography variant="subtitle2" sx={{ color: '#333' }}>
                  {st.name}
                </Typography>
                <Typography variant="body2" sx={{ color: '#333' }}>
                  ⚡ {st.maxPower} kW
                </Typography>
                <Typography variant="body2" sx={{ color: '#333' }}>
                  🟢 Free ports: {st.freePorts}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5, color: '#333' }}>
                  📍 {st.latitude.toFixed(6)}, {st.longitude.toFixed(6)}
                </Typography>
                <a
                  href={`https://www.google.com/maps?q=${st.latitude},${st.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.8rem', color: '#2e7d32' }}
                >
                  Open in Google Maps →
                </a>
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={handleClose}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}

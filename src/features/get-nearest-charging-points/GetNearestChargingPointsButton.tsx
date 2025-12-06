import { useState } from 'react'
import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import RoomOutlinedIcon from '@mui/icons-material/RoomOutlined'

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

async function fetchDirect(
  lat: number,
  lon: number
): Promise<StationListItem[]> {
  const latDelta = 25 / 111
  const lonDelta = 25 / (111 * Math.cos((lat * Math.PI) / 180))

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
  const [logs, setLogs] = useState<string[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  })

  const addLog = (msg: string) => {
    console.log(msg)
    setLogs((prev) => [
      ...prev.slice(-19),
      `[${new Date().toLocaleTimeString()}] ${msg}`,
    ])
  }

  const handleClick = async () => {
    try {
      setLoading(true)
      setLogs([])
      addLog('Starting location request...')

      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        })
      })

      const lat = pos.coords.latitude
      const lon = pos.coords.longitude
      addLog(`📍 Position: ${lat.toFixed(4)}, ${lon.toFixed(4)}`)

      const result = await fetchDirect(lat, lon)
      addLog(`🔍 Found ${result.length} stations`)
      setProgress({ current: 0, total: result.length })

      const freeStations: StationInfo[] = []

      for (const s of result) {
        setProgress((p) => ({ ...p, current: p.current + 1 }))

        const cpId = s.cpId
        const cuprId = s.locationData?.cuprId

        if (!cpId || !cuprId) {
          addLog(`⚠️ Station without cpId or cuprId`)
          continue
        }

        addLog(`📡 Fetching details for cuprId ${cuprId} (cpId ${cpId})...`)
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

          addLog(`  ✅ Added to results!`)
        }
      }

      addLog(`✨ Total free stations: ${freeStations.length}`)
      setStations(freeStations)
      setShowLogs(true)

      const ids = freeStations.map((s) => s.cpId)
      const preview = ids.slice(0, 5).join(', ')
      const more = ids.length > 5 ? ` … +${ids.length - 5} more` : ''
      const msg =
        ids.length > 0
          ? `Nearby stations: ${ids.length}, IDs: ${preview}${more}`
          : 'No stations found.'

      setSnackbar({
        open: true,
        message: msg,
        severity: ids.length > 0 ? 'success' : 'error',
      })
    } catch (err) {
      console.error('Error:', err)
      const errorMsg =
        err instanceof GeolocationPositionError
          ? 'Location access denied'
          : err instanceof Error
          ? err.message
          : 'Request failed'

      addLog(`❌ Error: ${errorMsg}`)
      setShowLogs(true)

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

        <Button
          size="small"
          variant="outlined"
          color="success"
          onClick={handleClick}
          disabled={loading}
          startIcon={<RoomOutlinedIcon fontSize="small" />}
        >
          {loading ? (
            <CircularProgress size={16} />
          ) : (
            'Get nearest charging points'
          )}
        </Button>

        {progress.total > 0 && (
          <Typography variant="caption" sx={{ color: '#555' }}>
            Fetching details… {progress.current} / {progress.total}
          </Typography>
        )}

        {showLogs && logs.length > 0 && (
          <Stack
            sx={{
              mt: 1,
              p: 1,
              background: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: 1,
              maxHeight: '200px',
              overflowY: 'auto',
              fontSize: '0.7rem',
              fontFamily: 'monospace',
              lineHeight: '1.4',
            }}
          >
            {logs.map((log, i) => (
              <Typography key={i} variant="caption" sx={{ display: 'block' }}>
                {log}
              </Typography>
            ))}
          </Stack>
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
                <Typography variant="subtitle2" sx={{ color: '#333' }}>{st.name}</Typography>
                <Typography variant="body2" sx={{ color: '#333' }}>⚡ {st.maxPower} kW</Typography>
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

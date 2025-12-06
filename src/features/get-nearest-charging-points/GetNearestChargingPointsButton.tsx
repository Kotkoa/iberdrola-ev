import { useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import RoomOutlinedIcon from '@mui/icons-material/RoomOutlined'

const IBERDROLA_URL =
  'https://corsproxy.io/?https://www.iberdrola.es/o/webclipb/iberdrola/puntosrecargacontroller/getListarPuntosRecarga'

async function fetchDirect() {
  const payload = {
    dto: {
      chargePointTypesCodes: ['P', 'R', 'I', 'N'],
      socketStatus: [],
      advantageous: false,
      connectorsType: ['2', '7'],
      loadSpeed: [],
      latitudeMax: 38.85,
      latitudeMin: 38.83,
      longitudeMax: -0.1,
      longitudeMin: -0.13,
    },
    language: 'en',
  }

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
  return data.entidad
}

export function GetNearestChargingPointsButton() {
  const [stations, setStations] = useState<Array<{ cpId: number | null }>>([])
  const [loading, setLoading] = useState(false)
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  })

  const stationIds = useMemo(
    () =>
      stations
        .map((s) => (s.cpId != null ? String(s.cpId) : null))
        .filter((id): id is string => Boolean(id)),
    [stations]
  )

  const handleClick = async () => {
    try {
      setLoading(true)
      const result = await fetchDirect()
      setStations(result)

      const ids = result
        .map((s) => s.cpId)
        .filter((id) => id != null)
      const preview = ids.slice(0, 5).join(', ')
      const more = ids.length > 5 ? ` … +${ids.length - 5} more` : ''
      const msg =
        ids.length > 0
          ? `Nearby stations: ${ids.length}, IDs: ${preview}${more}`
          : 'No stations found.'
      
      setSnackbar({
        open: true,
        message: msg,
        severity: 'success',
      })
    } catch (err) {
      console.error(err)
      setSnackbar({
        open: true,
        message: 'Request failed',
        severity: 'error',
      })
    } finally {
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

        {stationIds.length > 0 && !loading && (
          <Typography variant="caption" sx={{ wordBreak: 'break-word' }}>
            IDs: {stationIds.join(', ')}
          </Typography>
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

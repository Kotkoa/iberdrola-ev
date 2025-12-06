import { useMemo, useState } from 'react'
import Button from '@mui/material/Button'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import RoomOutlinedIcon from '@mui/icons-material/RoomOutlined'
import { useStations } from './useStations'

type SnackbarState = {
  open: boolean
  message: string
  severity: 'success' | 'error'
}

const initialSnackbarState: SnackbarState = {
  open: false,
  message: '',
  severity: 'success',
}

export function GetNearestChargingPointsButton() {
  const { stations, fetchStations, loading, error } = useStations()
  const [snackbar, setSnackbar] = useState<SnackbarState>(
    initialSnackbarState
  )

  const stationIds = useMemo(
    () =>
      stations
        .map((station) =>
          station.cp_id != null ? String(station.cp_id) : null
        )
        .filter((id): id is string => Boolean(id)),
    [stations]
  )

  const handleClose = () => setSnackbar((prev) => ({ ...prev, open: false }))

  const handleClick = async () => {
    try {
      const fetchedStations = await fetchStations()
      const ids = fetchedStations
        .map((station) =>
          station.cp_id != null ? String(station.cp_id) : null
        )
        .filter((id): id is string => Boolean(id))
      console.log('Stations within 10 km:', ids)
      setSnackbar({
        open: true,
        message:
          ids.length > 0
            ? `Nearby stations: ${ids.join(', ')}`
            : 'No nearby stations found.',
        severity: 'success',
      })
    } catch (err) {
      console.error(err)
      const message =
        err instanceof Error ? err.message : 'Unable to get nearby stations.'
      setSnackbar({ open: true, message, severity: 'error' })
    }
  }

  return (
    <>
      <Stack
        spacing={0.5}
        sx={{ mt: 2, mb: 3, alignItems: 'flex-start', width: '100%' }}
      >
        <Typography
          variant="subtitle2"
          color="textSecondary"
          sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
        >
          Find charging stations near you
        </Typography>
        <Button
          size="small"
          variant="outlined"
          color="success"
          onClick={handleClick}
          disabled={loading}
          startIcon={<RoomOutlinedIcon fontSize="small" />}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          {loading ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            'Get nearest charging points'
          )}
        </Button>
        {stationIds.length > 0 && !loading && (
          <Typography
            variant="caption"
            color="textSecondary"
            sx={{ wordBreak: 'break-word' }}
          >
            IDs: {stationIds.join(', ')}
          </Typography>
        )}
        {error && !loading && (
          <Typography variant="caption" color="error">
            {error.message}
          </Typography>
        )}
      </Stack>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleClose}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}

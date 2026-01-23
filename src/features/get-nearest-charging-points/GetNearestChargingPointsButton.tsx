import { useState } from 'react';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import RoomOutlinedIcon from '@mui/icons-material/RoomOutlined';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import { generateGoogleMapsUrl } from '../../utils/maps';
import {
  findNearestFreeStations,
  getUserLocation,
  type StationInfo,
} from '../../services/iberdrola';

const RADIUS_OPTIONS = [3, 5, 10, 15, 25, 40];

export function GetNearestChargingPointsButton() {
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [radius, setRadius] = useState(5);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  });

  const handleClick = async () => {
    try {
      setLoading(true);

      const pos = await getUserLocation();
      const freeStations = await findNearestFreeStations(
        pos.coords.latitude,
        pos.coords.longitude,
        radius,
        (current, total) => setProgress({ current, total })
      );

      setStations(freeStations);
    } catch (err) {
      const errorMsg =
        err instanceof GeolocationPositionError
          ? 'Location access denied'
          : err instanceof Error
            ? err.message
            : 'Request failed';

      setSnackbar({
        open: true,
        message: errorMsg,
        severity: 'error',
      });
    } finally {
      setProgress({ current: 0, total: 0 });
      setLoading(false);
    }
  };

  const handleClose = () => setSnackbar((prev) => ({ ...prev, open: false }));

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
              onChange={(e) => setRadius(Number(e.target.value))}
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
                  href={generateGoogleMapsUrl(st.latitude, st.longitude)}
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
  );
}

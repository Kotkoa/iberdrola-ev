import { useState, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
// import Switch from '@mui/material/Switch'; // TODO: temporarily hidden
import RoomOutlinedIcon from '@mui/icons-material/RoomOutlined';
import { RadiusSelector } from './RadiusSelector';
import { SearchResults } from './SearchResults';
import { SearchProgressBar } from './SearchProgressBar';
import { useStationSearch } from '../../hooks/useStationSearch';
import { usePrimaryStation } from '../../context/PrimaryStationContext';
import { useUserLocation } from '../../hooks/useUserLocation';
import type { StationInfoPartial } from '../../services/iberdrola';

interface SearchTabProps {
  onStationSelected?: () => void;
}

export function SearchTab({ onStationSelected }: SearchTabProps) {
  const [radius, setRadius] = useState(5);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  // const [showPaid, setShowPaid] = useState(false); // TODO: temporarily hidden

  const { stations, loading, enriching, progress, error, usingCachedData, search } =
    useStationSearch();

  const { primaryStationId, setPrimaryStation } = usePrimaryStation();
  const { location: userLocation } = useUserLocation();

  const handleSearch = () => {
    search(radius);
  };

  const handleSetPrimary = (station: StationInfoPartial) => {
    setPrimaryStation(station);
    setSnackbarOpen(true);
    if (onStationSelected) {
      onStationSelected();
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };

  // Auto-search on mount
  const hasSearchedRef = useRef(false);
  useEffect(() => {
    if (!hasSearchedRef.current) {
      hasSearchedRef.current = true;
      search(3); // default radius
    }
  }, [search]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flexShrink: 0 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Find charging stations near you
        </Typography>

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 2, width: '100%' }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <RadiusSelector value={radius} onChange={setRadius} disabled={loading} />

            <Button
              size="small"
              variant="outlined"
              color="success"
              onClick={handleSearch}
              disabled={loading}
              startIcon={<RoomOutlinedIcon fontSize="small" />}
              sx={{
                height: '40px',
                textTransform: 'none',
                fontSize: { xs: '0.75rem', sm: '0.875rem' },
              }}
            >
              {loading ? 'Searching...' : 'Find Stations'}
            </Button>
          </Stack>

          {/* TODO: temporarily hidden paid stations switcher
          <Switch
            checked={showPaid}
            onChange={(e) => setShowPaid(e.target.checked)}
            size="medium"
            sx={{
              ml: 'auto',
              '& .MuiSwitch-switchBase': {
                color: 'success.main',
                '&:hover': {
                  backgroundColor: 'rgba(76, 175, 80, 0.08)',
                },
              },
              '& .MuiSwitch-switchBase + .MuiSwitch-track': {
                backgroundColor: 'success.main',
              },
              '& .MuiSwitch-switchBase.Mui-checked': {
                color: 'warning.main',
                '&:hover': {
                  backgroundColor: 'rgba(255, 152, 0, 0.08)',
                },
              },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                backgroundColor: 'warning.main',
              },
            }}
          />
          */}
        </Stack>

        {(loading || enriching) && progress.total > 0 && (
          <SearchProgressBar current={progress.current} total={progress.total} />
        )}

        {error && (
          <Alert severity={usingCachedData ? 'warning' : 'error'} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {stations.length > 0 && (
          <SearchResults
            stations={stations}
            primaryStationId={primaryStationId}
            onSetPrimary={handleSetPrimary}
            userLocation={userLocation}
            showPaid={false} // TODO: temporarily always false
          />
        )}

        {!loading && !enriching && stations.length === 0 && !error && (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No stations found in this area.</Typography>
            <Typography variant="caption" color="text.secondary">
              Try increasing the search radius.
            </Typography>
          </Box>
        )}
      </Box>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={handleCloseSnackbar}>
          Primary station updated
        </Alert>
      </Snackbar>
    </Box>
  );
}

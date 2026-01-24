import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { StationResultCard } from './StationResultCard';
import type { StationInfo } from '../../services/iberdrola';
import { calculateDistance } from '../../utils/maps';

interface UserLocation {
  latitude: number;
  longitude: number;
}

interface SearchResultsProps {
  stations: StationInfo[];
  primaryStationId: number | null;
  onSetPrimary: (cpId: number, cuprId: number) => void;
  userLocation: UserLocation | null;
}

export function SearchResults({
  stations,
  primaryStationId,
  onSetPrimary,
  userLocation,
}: SearchResultsProps) {
  if (stations.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">
          No free charging stations found in this area.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Try increasing the search radius.
        </Typography>
      </Box>
    );
  }

  const getDistanceKm = (station: StationInfo): number | null => {
    if (!userLocation) return null;
    return calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      station.latitude,
      station.longitude
    );
  };

  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        {stations.length} station{stations.length !== 1 ? 's' : ''} found
      </Typography>
      {stations.map((station) => (
        <StationResultCard
          key={station.cpId}
          station={station}
          isPrimary={station.cpId === primaryStationId}
          onSetPrimary={onSetPrimary}
          distanceKm={getDistanceKm(station)}
        />
      ))}
    </Stack>
  );
}

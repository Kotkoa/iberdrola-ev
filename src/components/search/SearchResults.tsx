import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { StationResultCard } from './StationResultCard';
import type { StationInfoPartial } from '../../services/iberdrola';
import { calculateDistance } from '../../utils/maps';

interface UserLocation {
  latitude: number;
  longitude: number;
}

interface SearchResultsProps {
  stations: StationInfoPartial[];
  primaryStationId: number | null;
  onSetPrimary: (station: StationInfoPartial) => void;
  userLocation: UserLocation | null;
  showPaid: boolean;
}

interface StationWithDistance {
  station: StationInfoPartial;
  distanceKm: number | null;
}

export function SearchResults({
  stations,
  primaryStationId,
  onSetPrimary,
  userLocation,
  showPaid,
}: SearchResultsProps) {
  const filteredStations = useMemo(() => {
    return stations.filter((s) => {
      if (s.priceKwh === undefined) return true;
      return showPaid ? s.priceKwh > 0 : s.priceKwh === 0;
    });
  }, [stations, showPaid]);

  const sortedStations = useMemo((): StationWithDistance[] => {
    const withDistance = filteredStations.map((s) => ({
      station: s,
      distanceKm: userLocation
        ? calculateDistance(userLocation.latitude, userLocation.longitude, s.latitude, s.longitude)
        : null,
    }));

    if (userLocation) {
      withDistance.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }

    return withDistance;
  }, [filteredStations, userLocation]);

  if (filteredStations.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">
          No {showPaid ? 'paid' : 'free'} charging stations found in this area.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Try {showPaid ? 'switching to free stations or ' : ''}increasing the search radius.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1}>
      {sortedStations.map(({ station, distanceKm }) => (
        <StationResultCard
          key={station.cpId}
          station={station}
          isPrimary={station.cpId === primaryStationId}
          onSetPrimary={onSetPrimary}
          distanceKm={distanceKm}
        />
      ))}
    </Stack>
  );
}

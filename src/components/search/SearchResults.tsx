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
  onSetPrimary: (cpId: number, cuprId: number) => void;
  userLocation: UserLocation | null;
  showPaid: boolean;
}

export function SearchResults({
  stations,
  primaryStationId,
  onSetPrimary,
  userLocation,
  showPaid,
}: SearchResultsProps) {
  const getDistanceKm = (station: StationInfoPartial): number | null => {
    if (!userLocation) return null;
    return calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      station.latitude,
      station.longitude
    );
  };

  const filteredStations = useMemo(() => {
    return stations.filter((s) => {
      if (s.priceKwh === undefined) return true;
      return showPaid ? s.priceKwh > 0 : s.priceKwh === 0;
    });
  }, [stations, showPaid]);

  const sortedStations = useMemo(() => {
    if (!userLocation) return filteredStations;

    return [...filteredStations].sort((a, b) => {
      const distA = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        a.latitude,
        a.longitude
      );
      const distB = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        b.latitude,
        b.longitude
      );
      return distA - distB;
    });
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
      <Typography variant="caption" color="text.secondary">
        {filteredStations.length} {showPaid ? 'paid' : 'free'} station
        {filteredStations.length !== 1 ? 's' : ''} found
      </Typography>
      {sortedStations.map((station) => (
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

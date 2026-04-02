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
    return stations.filter((station) => {
      if (station.verificationState === 'verified_paid') return false;
      const isUnverified =
        !station.verificationState ||
        station.verificationState === 'unprocessed' ||
        station.verificationState === 'failed' ||
        station.verificationState === 'dead_letter';
      if (isUnverified) return true;
      if (station.priceKwh === undefined) return true;
      return showPaid ? station.priceKwh > 0 : station.priceKwh === 0;
    });
  }, [stations, showPaid]);

  const sortedStations = useMemo((): StationWithDistance[] => {
    const withDistance = filteredStations.map((station) => ({
      station,
      distanceKm: userLocation
        ? calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            station.latitude,
            station.longitude
          )
        : null,
    }));

    withDistance.sort((itemA, itemB) => {
      const isVerifiedA = itemA.station.verificationState === 'verified_free' ? 0 : 1;
      const isVerifiedB = itemB.station.verificationState === 'verified_free' ? 0 : 1;
      if (isVerifiedA !== isVerifiedB) return isVerifiedA - isVerifiedB;
      return (itemA.distanceKm ?? 0) - (itemB.distanceKm ?? 0);
    });

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
      <Typography variant="caption" color="text.secondary">
        {filteredStations.length} station{filteredStations.length !== 1 ? 's' : ''} found
      </Typography>
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

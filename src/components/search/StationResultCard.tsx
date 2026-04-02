import { memo } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import type { StationInfoPartial } from '../../services/iberdrola';
import { DistanceBadge } from '../common/DistanceBadge';

interface StationResultCardProps {
  station: StationInfoPartial;
  isPrimary: boolean;
  onSetPrimary: (station: StationInfoPartial) => void;
  distanceKm: number | null;
}

export const StationResultCard = memo(function StationResultCard({
  station,
  isPrimary,
  onSetPrimary,
  distanceKm,
}: StationResultCardProps) {
  const isVerifiedFree = station.verificationState === 'verified_free';
  const canSetPrimary = isVerifiedFree;

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canSetPrimary) return;
    onSetPrimary(station);
  };

  const addressParts = station.addressFull?.split(',').map((p) => p.trim()) ?? [];
  const streetAddress = addressParts.length > 2 ? addressParts.slice(0, -2).join(', ') : '';
  const cityRegion =
    addressParts.length >= 2 ? addressParts.slice(-2).join(', ') : station.addressFull;

  return (
    <Box
      sx={{
        p: 1.5,
        border: '1px solid',
        borderColor: isPrimary ? 'primary.main' : 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          {streetAddress && (
            <Typography
              variant="subtitle2"
              color="text.primary"
              sx={{
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {streetAddress}
            </Typography>
          )}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cityRegion}
          </Typography>
        </Box>

        <IconButton
          size="small"
          onClick={handleStarClick}
          color={isPrimary ? 'primary' : 'default'}
          disabled={!canSetPrimary && !isPrimary}
          aria-label={
            isPrimary
              ? 'Primary station'
              : canSetPrimary
                ? 'Set as primary'
                : 'Verification pending'
          }
          sx={{ opacity: canSetPrimary || isPrimary ? 1 : 0.3 }}
        >
          {isPrimary ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
        </IconButton>
      </Stack>

      <Stack direction="row" gap={0.5} sx={{ mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip
          label={`${station.maxPower ?? 22} kW`}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.7rem', height: 20 }}
        />
        {isVerifiedFree ? (
          <Chip
            label="FREE"
            size="small"
            color="success"
            variant="outlined"
            sx={{ fontSize: '0.7rem', height: 20 }}
          />
        ) : (
          <Chip
            label="Checking..."
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem', height: 20, color: 'text.secondary', borderColor: 'divider' }}
          />
        )}
        <Box sx={{ ml: 'auto' }}>
          <DistanceBadge
            distanceKm={distanceKm}
            latitude={station.latitude}
            longitude={station.longitude}
            size="small"
          />
        </Box>
      </Stack>
    </Box>
  );
});

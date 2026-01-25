import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import type { StationInfo } from '../../services/iberdrola';
import { AvailabilityBadge } from '../common/AvailabilityBadge';
import { DistanceBadge } from '../common/DistanceBadge';

interface StationResultCardProps {
  station: StationInfo;
  isPrimary: boolean;
  onSetPrimary: (cpId: number, cuprId: number) => void;
  distanceKm: number | null;
}

export function StationResultCard({
  station,
  isPrimary,
  onSetPrimary,
  distanceKm,
}: StationResultCardProps) {
  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSetPrimary(station.cpId, station.cuprId);
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

        <Stack direction="row" alignItems="center" spacing={0.5}>
          <AvailabilityBadge available={station.freePorts} total={2} />
          <IconButton
            size="small"
            onClick={handleStarClick}
            color={isPrimary ? 'primary' : 'default'}
            aria-label={isPrimary ? 'Primary station' : 'Set as primary'}
          >
            {isPrimary ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
          </IconButton>
        </Stack>
      </Stack>

      <Stack direction="row" gap={0.5} sx={{ mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip
          label={`${station.maxPower} kW`}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.7rem', height: 20 }}
        />
        <Chip
          label={station.priceKwh === 0 ? 'FREE' : `€${station.priceKwh.toFixed(4)}/kWh`}
          size="small"
          color={station.priceKwh === 0 ? 'success' : 'default'}
          variant={station.priceKwh === 0 ? 'filled' : 'outlined'}
          sx={{ fontSize: '0.7rem', height: 20 }}
        />
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
}

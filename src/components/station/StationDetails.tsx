import { Alert, Avatar, Box, Chip, Stack, Typography } from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { DistanceBadge } from '../common/DistanceBadge';
import { ConnectionIndicator } from '../common/ConnectionIndicator';
import { FreshnessIndicator } from '../common/FreshnessIndicator';
import { formatAddress } from '../../utils/address';
import type { RealtimeConnectionState } from '../../../types/realtime';

interface StationDetailsProps {
  cpId: number;
  cpName: string;
  schedule: string | null;
  availableCount: number;
  addressFull?: string | null;
  emergencyStopPressed?: boolean | null;
  situationCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distanceKm?: number | null;
  /** @deprecated Use connectionState instead */
  hasRealtime?: boolean;
  connectionState?: RealtimeConnectionState;
  observedAt?: string | null;
  isStale?: boolean;
  scraperTriggered?: boolean;
  isRateLimited?: boolean;
}

export function StationDetails({
  cpId,
  cpName,
  schedule,
  availableCount,
  addressFull,
  emergencyStopPressed,
  situationCode,
  latitude,
  longitude,
  distanceKm,
  hasRealtime,
  connectionState,
  observedAt,
  isStale = false,
  scraperTriggered = false,
  isRateLimited = false,
}: StationDetailsProps) {
  // Use connectionState if provided, otherwise derive from hasRealtime for backwards compatibility
  // Default to 'disconnected' when neither is specified to avoid misleading "Live" indicator
  const effectiveConnectionState: RealtimeConnectionState =
    connectionState ?? (hasRealtime === true ? 'connected' : 'disconnected');
  const hasCoordinates = Boolean(latitude && longitude);

  return (
    <Box
      sx={{
        textAlign: 'start',
        width: '100%',
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography
          variant="h5"
          component="h1"
          data-testid="station-availability"
          sx={{ fontSize: { xs: '1.1rem', sm: '1.5rem' } }}
          color={availableCount > 0 ? 'success' : 'warning'}
        >
          {availableCount > 0 ? `Available: ${availableCount} of 2` : 'All ports are busy'}
        </Typography>
      </Stack>

      <Stack direction="row" gap={0.5} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        <Chip
          label="Iberdrola"
          color="default"
          variant="outlined"
          size="small"
          sx={{
            borderRadius: '4px',
            flexDirection: 'row-reverse',
            pr: 1,
            fontSize: { xs: '0.7rem', sm: '0.813rem' },
          }}
          avatar={
            <Avatar
              src="/iberdrola-logo.webp"
              alt="Iberdrola"
              sx={{ width: 16, height: 16 }}
              slotProps={{ img: { loading: 'lazy' } }}
            />
          }
        />
        <Chip
          label={`ID.${cpId}`}
          color="default"
          variant="outlined"
          size="small"
          data-testid="station-id-chip"
          sx={{
            borderRadius: '4px',
            fontSize: { xs: '0.7rem', sm: '0.813rem' },
          }}
        />
        <ConnectionIndicator state={effectiveConnectionState} size="small" />
        <FreshnessIndicator
          observedAt={observedAt ?? null}
          isStale={isStale}
          scraperTriggered={scraperTriggered}
          isRateLimited={isRateLimited}
          size="small"
        />
      </Stack>

      <Typography
        variant="body1"
        color="text.primary"
        sx={{
          fontSize: { xs: '0.9rem', sm: '1rem' },
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <LocationOnIcon sx={{ fontSize: '1rem' }} />
        {formatAddress(addressFull) ?? cpName}
      </Typography>

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 0.5 }}>
        <Typography
          variant="caption"
          color="textSecondary"
          sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
        >
          Level: 0 / Spot: 1{schedule ? ` / ${schedule}` : ''}
        </Typography>
        {hasCoordinates && (
          <DistanceBadge
            distanceKm={distanceKm ?? null}
            latitude={latitude!}
            longitude={longitude!}
            size="small"
          />
        )}
      </Stack>

      {emergencyStopPressed && (
        <Alert
          severity="error"
          icon={<WarningAmberIcon />}
          data-testid="emergency-alert"
          sx={{ mt: 1, mb: 1, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
        >
          Emergency stop activated - station unavailable
        </Alert>
      )}

      {situationCode && situationCode !== 'OPER' && (
        <Alert
          severity="warning"
          data-testid="maintenance-alert"
          sx={{ mt: 1, mb: 1, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
        >
          Station status:{' '}
          {situationCode === 'MAINT'
            ? 'Maintenance'
            : situationCode === 'OOS'
              ? 'Out of Service'
              : situationCode}
        </Alert>
      )}
    </Box>
  );
}

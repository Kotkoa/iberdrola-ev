import { Alert, Avatar, Box, Button, Chip, Stack, Typography } from '@mui/material';
import DirectionsIcon from '@mui/icons-material/Directions';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

interface ChargingStationInfoProps {
  cpId: number;
  cpName: string;
  schedule: string | null;
  availableCount: number;
  onShowOnMap: () => void;
  hasCoordinates: boolean;
  // Extended fields
  addressFull?: string | null;
  emergencyStopPressed?: boolean | null;
  situationCode?: string | null;
}

export function ChargingStationInfo({
  cpId,
  cpName,
  schedule,
  availableCount,
  onShowOnMap,
  hasCoordinates,
  addressFull,
  emergencyStopPressed,
  situationCode,
}: ChargingStationInfoProps) {
  return (
    <Box
      sx={{
        textAlign: 'start',
        width: '100%',
        maxWidth: { xs: '100%', sm: '400px' },
      }}
    >
      <Typography
        variant="h5"
        component="h1"
        sx={{ mb: 1, fontSize: { xs: '1.1rem', sm: '1.5rem' } }}
        color={availableCount > 0 ? 'success' : 'warning'}
      >
        Available {availableCount}/2
      </Typography>

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
          label="Not reservable"
          color="default"
          variant="outlined"
          size="small"
          sx={{
            borderRadius: '4px',
            fontSize: { xs: '0.7rem', sm: '0.813rem' },
          }}
        />
        <Chip
          label={`ID.${cpId}`}
          color="default"
          variant="outlined"
          size="small"
          sx={{
            borderRadius: '4px',
            fontSize: { xs: '0.7rem', sm: '0.813rem' },
          }}
        />
      </Stack>

      {addressFull && (
        <Typography
          variant="caption"
          color="textSecondary"
          sx={{
            mt: 0.5,
            fontSize: { xs: '0.65rem', sm: '0.75rem' },
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <LocationOnIcon sx={{ fontSize: '0.875rem' }} />
          {addressFull}
        </Typography>
      )}
      <Typography
        variant="body1"
        color="textPrimary"
        fontWeight={600}
        sx={{ fontSize: { xs: '0.9rem', sm: '1rem' } }}
      >
        {cpName}
      </Typography>
      <Typography
        variant="caption"
        color="textSecondary"
        sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
      >
        Level: 0 / Spot: 1{schedule ? ` / ${schedule}` : ''}
      </Typography>

      <Stack sx={{ my: 1 }}>
        <Button
          onClick={onShowOnMap}
          disabled={!hasCoordinates}
          size="small"
          sx={{
            ml: 'auto',
            textTransform: 'none',
            fontSize: { xs: '0.7rem', sm: '0.875rem' },
          }}
          startIcon={<DirectionsIcon fontSize="small" />}
          variant="outlined"
          color="success"
        >
          Show on map
        </Button>
      </Stack>

      {/* Emergency stop alert */}
      {emergencyStopPressed && (
        <Alert
          severity="error"
          icon={<WarningAmberIcon />}
          sx={{ mb: 1, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
        >
          Emergency stop activated - station unavailable
        </Alert>
      )}

      {/* Station status warning */}
      {situationCode && situationCode !== 'OPER' && (
        <Alert severity="warning" sx={{ mb: 1, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
          Station status:{' '}
          {situationCode === 'MAINT'
            ? 'Maintenance'
            : situationCode === 'OOS'
              ? 'Out of Service'
              : situationCode}
        </Alert>
      )}

      <Stack
        direction="row"
        alignItems="center"
        sx={{
          border: '1px solid #ccc',
          borderRadius: 2,
          mb: 1,
          px: 1,
          py: 0.5,
        }}
      >
        <InfoOutlinedIcon
          fontSize="small"
          sx={{ width: { xs: 16, sm: 20 }, height: { xs: 16, sm: 20 } }}
        />
        <Typography
          variant="body2"
          color="textPrimary"
          sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}
        >
          Charging point with limited power
        </Typography>
      </Stack>
    </Box>
  );
}

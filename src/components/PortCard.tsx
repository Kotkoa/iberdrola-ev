import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import EuroIcon from '@mui/icons-material/Euro';
import EvStationIcon from '@mui/icons-material/EvStation';

export interface PortCardProps {
  portNumber: 1 | 2;
  isAvailable: boolean;
  busyDuration: string | null;
  powerKw: number | null;
  // Extended fields
  priceKwh?: number | null;
  socketType?: string | null;
}

export function PortCard({
  portNumber,
  isAvailable,
  busyDuration,
  powerKw,
  priceKwh,
  socketType,
}: PortCardProps) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: isAvailable ? 'success.main' : 'warning.main',
        borderRadius: 2,
        height: 100,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        width: 'fit-content',
      }}
    >
      <Box
        sx={{
          bgcolor: isAvailable ? 'success.main' : 'warning.main',
          color: 'primary.contrastText',
          px: 2,
          py: 0.5,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Semi-fast
        </Typography>
        <Typography variant="caption">
          {busyDuration ? `Busy for ${busyDuration}` : 'Free charging point'}
        </Typography>
      </Box>
      <Stack direction="row" alignItems="center" height="100%">
        <Box
          sx={{
            width: 25,
            height: 25,
            borderRadius: '50%',
            bgcolor: 'grey.200',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 2,
          }}
        >
          <Typography variant="subtitle2" fontWeight={600}>
            {portNumber}
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" sx={{ mr: 2, ml: 'auto', textAlign: 'right' }}>
          <Box
            component="img"
            src="/tipo-2.svg"
            alt={`Connector ${portNumber}`}
            sx={{ width: 32, height: 32, mr: 1 }}
          />
          <Box>
            {socketType && (
              <Typography
                variant="body2"
                color="textSecondary"
                sx={{ display: 'flex', alignItems: 'center', gap: 0.25, fontSize: '0.75rem' }}
              >
                <EvStationIcon sx={{ fontSize: '0.875rem' }} />
                {socketType}
              </Typography>
            )}
            <Typography variant="body2" color="textSecondary">
              {powerKw} kW
            </Typography>
            {priceKwh !== undefined && priceKwh !== null && (
              <Box sx={{ mt: 0.5 }}>
                {priceKwh === 0 ? (
                  <Chip
                    label="FREE"
                    size="small"
                    color="success"
                    icon={<EuroIcon />}
                    sx={{ height: 20, fontSize: '0.65rem' }}
                  />
                ) : (
                  <Typography
                    variant="caption"
                    color="textPrimary"
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.25, fontSize: '0.7rem' }}
                  >
                    <EuroIcon sx={{ fontSize: '0.75rem' }} />
                    {priceKwh.toFixed(4)}/kWh
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </Stack>
      </Stack>
    </Box>
  );
}

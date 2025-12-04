import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

export interface PortCardProps {
  portNumber: 1 | 2
  isAvailable: boolean
  busyDuration: string | null
  powerKw: number | null
}

export function PortCard({
  portNumber,
  isAvailable,
  busyDuration,
  powerKw,
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
        <Stack
          direction="row"
          alignItems="center"
          sx={{ mr: 2, ml: 'auto', textAlign: 'right' }}
        >
          <Box
            component="img"
            src="/tipo-2.svg"
            alt={`Connector ${portNumber}`}
            sx={{ width: 32, height: 32, mr: 1 }}
          />
          <Box>
            <Typography variant="body2" color="textSecondary">
              Type 2
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {powerKw} kW
            </Typography>
          </Box>
        </Stack>
      </Stack>
    </Box>
  )
}

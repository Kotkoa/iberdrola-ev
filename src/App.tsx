import './App.css'

import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Chip from '@mui/material/Chip'
import Avatar from '@mui/material/Avatar'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import DirectionsIcon from '@mui/icons-material/Directions'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Copyright from './components/Copyright'
import { useCharger } from '../hooks/useCharger'

function App() {
  const { data: charger, loading, error } = useCharger()

  const isFirstPortAvailable = charger?.port1_status === 'AVAILABLE'
  const isSecondPortAvailable = charger?.port2_status === 'AVAILABLE'
  const statusSummary = {
    available: (isFirstPortAvailable ? 1 : 0) + (isSecondPortAvailable ? 1 : 0),
  }

  return (
    <Container
      maxWidth="sm"
      className="border border-gray-200 rounded-xl shadow-md"
    >
      <Box sx={{ m: 4, textAlign: 'start', width: '400px' }}>
        {loading && (
          <Stack alignItems="center" spacing={1} sx={{ my: 4 }}>
            <CircularProgress size={28} />
            <Typography variant="body2" color="textSecondary">
              Loading charging point...
            </Typography>
          </Stack>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>Failed to load data</AlertTitle>
            {error}
          </Alert>
        )}
        {charger && (
          <>
            <Typography
              variant="h5"
              component="h1"
              sx={{ mb: 1 }}
              color={statusSummary.available > 0 ? 'success' : 'warning'}
            >
              Available {statusSummary.available}/2
            </Typography>
            <Stack direction="row" gap={2}>
              <Chip
                label="Iberdrola"
                color="default"
                variant="outlined"
                size="small"
                sx={{
                  borderRadius: '4px',
                  flexDirection: 'row-reverse',
                  pr: 1,
                }}
                avatar={
                  <Avatar
                    src="/iberdrola-logo.webp"
                    alt="Iberdrola"
                    sx={{ width: 18, height: 18 }}
                    slotProps={{ img: { loading: 'lazy' } }}
                  />
                }
              />
              <Chip
                label="Not reservable"
                color="default"
                variant="outlined"
                size="small"
                sx={{ borderRadius: '4px' }}
              />
            </Stack>
            <Typography variant="caption" color="textSecondary" sx={{ mt: 1 }}>
              PEGO, ALICANTE
            </Typography>
            <Typography variant="body1" color="textPrimary" fontWeight={600}>
              {charger.cp_name}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Level: 0 / Spot: 1 / {charger.schedule}
            </Typography>
            <Stack>
              <Chip
                label="Show on map"
                color="success"
                variant="outlined"
                size="small"
                sx={{
                  borderRadius: '4px',
                  flexDirection: 'row-reverse',
                  pr: 1,
                  ml: 'auto',
                }}
                icon={<DirectionsIcon fontSize="small" />}
              />
            </Stack>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{
                mt: 4,
                border: '1px solid #ccc',
                borderRadius: '4px',
                p: 2,
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <InfoOutlinedIcon fontSize="small" />
                <Typography variant="body2" color="textPrimary">
                  Charging point with limited power
                </Typography>
              </Stack>
              <Typography variant="caption" color="textSecondary">
                ID. {charger.cp_id}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              <Box
                sx={{
                  border: 2,
                  borderColor: isFirstPortAvailable
                    ? 'success.main'
                    : 'primary.main',
                  borderRadius: 2,
                  height: 140,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  flex: 1,
                }}
              >
                <Box
                  sx={{
                    bgcolor: isFirstPortAvailable
                      ? 'success.main'
                      : 'primary.main',
                    color: 'primary.contrastText',
                    px: 2,
                    py: 0.5,
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{ lineHeight: 1.2, fontWeight: 600 }}
                  >
                    Semi-fast
                  </Typography>
                  <Typography variant="caption" sx={{ lineHeight: 1.2 }}>
                    Free charging point
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
                      1
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
                      alt="Connector 1"
                      sx={{ width: 32, height: 32, mr: 1 }}
                    />
                    <Box>
                      <Typography variant="body2" color="textSecondary">
                        Type 2
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {charger.port1_power_kw} kW
                      </Typography>
                    </Box>
                  </Stack>
                </Stack>
              </Box>
              <Box
                sx={{
                  border: 2,
                  borderColor: isSecondPortAvailable
                    ? 'success.main'
                    : 'primary.main',
                  borderRadius: 2,
                  height: 140,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  flex: 1,
                }}
              >
                <Box
                  sx={{
                    bgcolor: isSecondPortAvailable
                      ? 'success.main'
                      : 'primary.main',
                    color: 'primary.contrastText',
                    px: 2,
                    py: 0.5,
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{ lineHeight: 1.2, fontWeight: 600 }}
                  >
                    Semi-fast
                  </Typography>
                  <Typography variant="caption" sx={{ lineHeight: 1.2 }}>
                    Free charging point
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
                      1
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
                      alt="Connector 1"
                      sx={{ width: 32, height: 32, mr: 1 }}
                    />
                    <Box>
                      <Typography variant="body2" color="textSecondary">
                        Type 2
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {charger.port2_power_kw} kW
                      </Typography>
                    </Box>
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          </>
        )}
        {!loading && !charger && !error && (
          <Typography variant="body2" color="textSecondary">
            No data available.
          </Typography>
        )}
        <Copyright />
      </Box>
    </Container>
  )
}

export default App

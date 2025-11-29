import './App.css'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Chip from '@mui/material/Chip'
import Avatar from '@mui/material/Avatar'
import Copyright from './components/Copyright'
import DirectionsIcon from '@mui/icons-material/Directions'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

function App() {
  return (
    <Container
      maxWidth="sm"
      className="border border-gray-200 rounded-xl shadow-md"
    >
      <Box sx={{ m: 4, textAlign: 'start', width: '400px' }}>
        <Typography variant="h5" component="h1" sx={{ mb: 1 }} color="success">
          Available 1/2
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
        <Typography variant="caption" color="textSecondary">
          PEGO, ALICANTE
        </Typography>
        <Typography variant="body1" color="textPrimary" fontWeight={600}>
          Paseo Cervantes 10, AYTO PEGO
        </Typography>
        <Typography variant="caption" color="textSecondary">
          Level: 0 / Spot: 1
        </Typography>
        <Stack>
          <Chip
            label="Go to 0,42 km"
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
            ID. 140671
          </Typography>
        </Stack>
        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
          {[1, 2].map((block) => (
            <Box
              key={block}
              sx={{
                border: 2,
                borderColor: 'primary.main',
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
                  bgcolor: 'primary.main',
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
                    {block}
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
                    alt="Type 2 connector"
                    sx={{ width: 32, height: 32 }}
                  />
                  <Box>
                    <Typography variant="body2" color="textSecondary">
                      Type 2
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      22 kW
                    </Typography>
                  </Box>
                </Stack>
              </Stack>
            </Box>
          ))}
        </Stack>
        <Copyright />
      </Box>
    </Container>
  )
}

export default App

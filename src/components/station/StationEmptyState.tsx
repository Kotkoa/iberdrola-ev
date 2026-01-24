import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import SearchIcon from '@mui/icons-material/Search';

interface StationEmptyStateProps {
  onNavigateToSearch: () => void;
}

export function StationEmptyState({ onNavigateToSearch }: StationEmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        px: 2,
        textAlign: 'center',
      }}
    >
      <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
        No primary station selected
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Search for nearby charging stations and set one as your primary station for real-time
        updates.
      </Typography>
      <Button
        variant="contained"
        color="primary"
        startIcon={<SearchIcon />}
        onClick={onNavigateToSearch}
        sx={{ textTransform: 'none' }}
      >
        Find stations nearby
      </Button>
    </Box>
  );
}

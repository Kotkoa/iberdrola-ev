import { Box, Container, Typography } from '@mui/material';

export function EmptyState() {
  return (
    <Container maxWidth="sm" className="rounded-xl border border-gray-200 bg-white shadow-md">
      <Box sx={{ m: 4 }}>
        <Typography variant="body2" color="textSecondary">
          No data available.
        </Typography>
      </Box>
    </Container>
  );
}

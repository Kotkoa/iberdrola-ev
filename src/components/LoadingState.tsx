import { Box, CircularProgress, Container, Stack, Typography } from '@mui/material';

export function LoadingState() {
  return (
    <Container maxWidth="sm" className="rounded-xl border border-gray-200 bg-white shadow-md">
      <Box sx={{ m: 4 }}>
        <Stack alignItems="center" spacing={1} sx={{ my: 4 }}>
          <CircularProgress size={28} />
          <Typography variant="body2" color="textSecondary">
            Loading charging point...
          </Typography>
        </Stack>
      </Box>
    </Container>
  );
}

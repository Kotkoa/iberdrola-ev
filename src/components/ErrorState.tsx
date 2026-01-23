import { Alert, AlertTitle, Box, Container } from '@mui/material';

interface ErrorStateProps {
  error: string;
}

export function ErrorState({ error }: ErrorStateProps) {
  return (
    <Container maxWidth="sm" className="rounded-xl border border-gray-200 bg-white shadow-md">
      <Box sx={{ m: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          <AlertTitle>Failed to load data</AlertTitle>
          {error}
        </Alert>
      </Box>
    </Container>
  );
}

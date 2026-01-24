import type { ReactNode } from 'react';
import Container from '@mui/material/Container';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <Container
      maxWidth={false}
      sx={{
        bgcolor: 'background.paper',
        width: { xs: '100%', sm: '450px' },
        minWidth: { xs: 'auto', sm: '450px' },
        height: { xs: '100vh', sm: '651px' },
        maxHeight: { xs: '100vh', sm: '651px' },
        px: 3,
        py: { xs: 0, sm: 2 },
        mx: { xs: 0, sm: 'auto' },
        my: { xs: 0, sm: 4 },
        borderRadius: { xs: 0, sm: 2 },
        boxShadow: { xs: 'none', sm: 3 },
        border: { xs: 'none', sm: '1px solid' },
        borderColor: { xs: 'transparent', sm: 'divider' },
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {children}
    </Container>
  );
}

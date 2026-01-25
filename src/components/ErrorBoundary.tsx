import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Box, Button, Container, Typography, Paper } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { unsubscribeAllChannels } from '../../api/charger.js';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = (): void => {
    unsubscribeAllChannels();
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Container maxWidth="md">
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '100vh',
              py: 4,
            }}
          >
            <Paper
              elevation={3}
              sx={{
                p: 4,
                textAlign: 'center',
                backgroundColor: 'background.paper',
              }}
            >
              <ErrorOutlineIcon
                sx={{
                  fontSize: 80,
                  color: 'error.main',
                  mb: 2,
                }}
              />
              <Typography variant="h4" component="h1" gutterBottom>
                Who-ops
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                Something went wrong. Please try again later.
              </Typography>

              {import.meta.env.DEV && this.state.error && (
                <Box
                  sx={{
                    mt: 2,
                    p: 2,
                    backgroundColor: 'grey.100',
                    borderRadius: 1,
                    textAlign: 'left',
                    maxWidth: '100%',
                    overflow: 'auto',
                  }}
                >
                  <Typography variant="caption" component="pre" sx={{ fontSize: '0.75rem' }}>
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </Typography>
                </Box>
              )}

              <Button
                variant="contained"
                color="primary"
                size="large"
                onClick={this.handleReset}
                sx={{ mt: 3 }}
              >
                Close
              </Button>
            </Paper>
          </Box>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

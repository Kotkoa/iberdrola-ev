import { Alert, AlertTitle, Box, Button } from '@mui/material';
import type { PortNumber, SubscriptionStatus } from '../types';

interface SubscriptionPanelProps {
  portNumber: PortNumber;
  subscriptionState: SubscriptionStatus;
  errorMessage: string | null;
  pushAvailable: boolean;
  onSubscribeClick: (portNumber: PortNumber) => void;
}

export function SubscriptionPanel({
  portNumber,
  subscriptionState,
  errorMessage,
  pushAvailable,
  onSubscribeClick,
}: SubscriptionPanelProps) {
  const buttonLabel =
    subscriptionState === 'success'
      ? 'Waiting'
      : subscriptionState === 'error'
        ? 'Try again'
        : 'Get notified';

  const isDisabled =
    !pushAvailable || subscriptionState === 'loading' || subscriptionState === 'success';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Button
        variant="contained"
        color="success"
        fullWidth
        disabled={isDisabled}
        onClick={() => onSubscribeClick(portNumber)}
        sx={{
          textTransform: 'none',
          fontSize: { xs: '0.75rem', sm: '0.875rem' },
        }}
      >
        {subscriptionState === 'loading' ? 'Subscribing...' : buttonLabel}
      </Button>
      {subscriptionState === 'success' && (
        <Alert severity="success">Notifications enabled for port {portNumber}.</Alert>
      )}
      {subscriptionState === 'error' && errorMessage && (
        <Alert severity="warning">
          <AlertTitle>Subscription error</AlertTitle>
          {errorMessage}
        </Alert>
      )}
    </Box>
  );
}

import { Alert, AlertTitle, Button } from '@mui/material';
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
      ? 'Notifications enabled'
      : subscriptionState === 'error'
        ? 'Error enabling notifications'
        : 'Notify me when free';

  return (
    <>
      <Button
        variant="contained"
        color="success"
        disabled={
          !pushAvailable || subscriptionState === 'loading' || subscriptionState === 'success'
        }
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
    </>
  );
}

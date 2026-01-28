import { Alert, AlertTitle, Box, Button, Stack, Typography } from '@mui/material';
import { PortCard } from './PortCard';
import type { PortNumber, SubscriptionStatus } from '../types';

interface PortConfig {
  portNumber: PortNumber;
  isAvailable: boolean;
  busyDuration: string | null;
  powerKw: number | null;
  priceKwh?: number | null;
  socketType?: string | null;
}

interface PortsListProps {
  portConfigs: PortConfig[];
  subscriptionState: Record<PortNumber, SubscriptionStatus>;
  subscriptionErrors: Record<PortNumber, string | null>;
  pushAvailable: boolean;
  isStandalone: boolean;
  onSubscribeClick: (portNumber: PortNumber) => void;
}

export function PortsList({
  portConfigs,
  subscriptionState,
  subscriptionErrors,
  pushAvailable,
  onSubscribeClick,
}: PortsListProps) {
  const subscribedCount = Object.values(subscriptionState).filter((s) => s === 'success').length;

  const alertMessage =
    subscribedCount === 2
      ? "We'll alert you as soon as this station is available"
      : "We'll alert you as soon as this port is available";

  return (
    <>
      <Stack
        direction="row"
        spacing={1.5}
        justifyContent="space-between"
        alignItems="stretch"
        sx={{ mt: 1 }}
      >
        {portConfigs.map(
          ({ portNumber, isAvailable, busyDuration, powerKw, priceKwh, socketType }) => {
            const state = subscriptionState[portNumber];
            const errorMessage = subscriptionErrors[portNumber];

            const buttonLabel =
              state === 'success'
                ? 'Alert active'
                : state === 'error'
                  ? 'Try again'
                  : 'Get notified';

            const isDisabled = !pushAvailable || state === 'loading' || state === 'success';

            return (
              <Box
                key={portNumber}
                sx={{
                  flex: 1,
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                <PortCard
                  portNumber={portNumber}
                  isAvailable={isAvailable}
                  busyDuration={busyDuration}
                  powerKw={powerKw}
                  priceKwh={priceKwh}
                  socketType={socketType}
                />
                {!isAvailable && (
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
                      {state === 'loading' ? 'Subscribing...' : buttonLabel}
                    </Button>
                    {state === 'error' && errorMessage && (
                      <Alert severity="warning">
                        <AlertTitle>Subscription error</AlertTitle>
                        {errorMessage}
                      </Alert>
                    )}
                  </Box>
                )}
              </Box>
            );
          }
        )}
      </Stack>
      {subscribedCount > 0 && (
        <Alert severity="success" sx={{ mt: 1.5 }}>
          {alertMessage}
        </Alert>
      )}
      {portConfigs.some((p) => !p.isAvailable) && pushAvailable && subscribedCount === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 1.5 }}>
          No waiting. No checking. Just come when it's free.
        </Typography>
      )}
      {!pushAvailable && (
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1.5 }}>
          Push notifications are not supported in this browser.
        </Typography>
      )}
    </>
  );
}

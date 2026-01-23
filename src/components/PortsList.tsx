import { Box, Stack, Typography } from '@mui/material';
import { PortCard } from './PortCard';
import { SubscriptionPanel } from './SubscriptionPanel';
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
  isStandalone,
  onSubscribeClick,
}: PortsListProps) {
  return (
    <>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        justifyContent="space-between"
        alignItems="stretch"
        sx={{ mt: 1 }}
      >
        {portConfigs.map(
          ({ portNumber, isAvailable, busyDuration, powerKw, priceKwh, socketType }) => {
            const state = subscriptionState[portNumber];
            const errorMessage = subscriptionErrors[portNumber];

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
                {isStandalone && (
                  <SubscriptionPanel
                    portNumber={portNumber}
                    subscriptionState={state}
                    errorMessage={errorMessage}
                    pushAvailable={pushAvailable}
                    onSubscribeClick={onSubscribeClick}
                  />
                )}
              </Box>
            );
          }
        )}
      </Stack>
      {isStandalone && !pushAvailable && (
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1.5 }}>
          Push notifications are not supported in this browser.
        </Typography>
      )}
    </>
  );
}

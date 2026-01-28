import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import SyncIcon from '@mui/icons-material/Sync';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import type { RealtimeConnectionState } from '../../../types/realtime';

interface ConnectionIndicatorProps {
  state: RealtimeConnectionState;
  size?: 'small' | 'medium';
}

const CONNECTION_CONFIG: Record<
  RealtimeConnectionState,
  {
    label: string;
    color: 'success' | 'warning' | 'error' | 'default';
    Icon: typeof WifiIcon;
    animate?: boolean;
  }
> = {
  connected: {
    label: 'Live',
    color: 'success',
    Icon: WifiIcon,
  },
  connecting: {
    label: 'Connecting...',
    color: 'warning',
    Icon: SyncIcon,
    animate: true,
  },
  reconnecting: {
    label: 'Reconnecting...',
    color: 'warning',
    Icon: SyncIcon,
    animate: true,
  },
  disconnected: {
    label: 'Offline',
    color: 'error',
    Icon: WifiOffIcon,
  },
  error: {
    label: 'Connection error',
    color: 'error',
    Icon: ErrorOutlineIcon,
  },
};

export function ConnectionIndicator({ state, size = 'small' }: ConnectionIndicatorProps) {
  const config = CONNECTION_CONFIG[state];
  const { Icon } = config;

  return (
    <Chip
      label={config.label}
      color={config.color}
      variant="outlined"
      size={size}
      icon={
        config.animate ? (
          <CircularProgress size={12} color="inherit" sx={{ ml: 0.5 }} />
        ) : (
          <Icon sx={{ fontSize: '1rem' }} />
        )
      }
      sx={{
        borderRadius: '4px',
        fontSize: { xs: '0.7rem', sm: '0.813rem' },
      }}
    />
  );
}

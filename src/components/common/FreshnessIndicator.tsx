import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import UpdateIcon from '@mui/icons-material/Update';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { formatDuration } from '../../utils/time';

interface FreshnessIndicatorProps {
  /** ISO timestamp of when data was last observed */
  observedAt: string | null;
  /** Whether data is older than the freshness TTL */
  isStale: boolean;
  /** Whether scraper was triggered and we're waiting for fresh data */
  scraperTriggered: boolean;
  /** Whether the station is rate limited */
  isRateLimited: boolean;
  size?: 'small' | 'medium';
}

function getAgeLabel(observedAt: string | null): string {
  if (!observedAt) return 'No data';
  const ageMs = Date.now() - new Date(observedAt).getTime();
  if (Number.isNaN(ageMs) || ageMs < 0) return 'No data';
  const ageMinutes = Math.floor(ageMs / 60_000);
  return formatDuration(ageMinutes) ?? '< 1 min';
}

export function FreshnessIndicator({
  observedAt,
  isStale,
  scraperTriggered,
  isRateLimited,
  size = 'small',
}: FreshnessIndicatorProps) {
  if (!observedAt) return null;

  // Updating — scraper triggered, waiting for Realtime
  if (isStale && scraperTriggered) {
    return (
      <Chip
        label="Updating..."
        color="warning"
        variant="outlined"
        size={size}
        data-testid="freshness-indicator"
        icon={<CircularProgress size={12} color="inherit" sx={{ ml: 0.5 }} />}
        sx={{ borderRadius: '4px', fontSize: { xs: '0.7rem', sm: '0.813rem' } }}
      />
    );
  }

  const ageLabel = getAgeLabel(observedAt);

  // Fresh data
  if (!isStale) {
    return (
      <Chip
        label={ageLabel}
        color="success"
        variant="outlined"
        size={size}
        data-testid="freshness-indicator"
        icon={<CheckCircleOutlineIcon sx={{ fontSize: '1rem' }} />}
        sx={{ borderRadius: '4px', fontSize: { xs: '0.7rem', sm: '0.813rem' } }}
      />
    );
  }

  // Stale + rate limited
  if (isRateLimited) {
    return (
      <Chip
        label={ageLabel}
        color="default"
        variant="outlined"
        size={size}
        data-testid="freshness-indicator"
        icon={<UpdateIcon sx={{ fontSize: '1rem' }} />}
        sx={{ borderRadius: '4px', fontSize: { xs: '0.7rem', sm: '0.813rem' } }}
      />
    );
  }

  // Stale, not updating
  return (
    <Chip
      label={ageLabel}
      color="warning"
      variant="outlined"
      size={size}
      data-testid="freshness-indicator"
      icon={<UpdateIcon sx={{ fontSize: '1rem' }} />}
      sx={{ borderRadius: '4px', fontSize: { xs: '0.7rem', sm: '0.813rem' } }}
    />
  );
}

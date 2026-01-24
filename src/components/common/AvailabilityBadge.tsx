import Chip from '@mui/material/Chip';

interface AvailabilityBadgeProps {
  available: number;
  total: number;
  size?: 'small' | 'medium';
}

export function AvailabilityBadge({ available, total, size = 'small' }: AvailabilityBadgeProps) {
  const isAllAvailable = available === total;
  const isNoneAvailable = available === 0;

  const color = isAllAvailable ? 'success' : isNoneAvailable ? 'error' : 'warning';

  return (
    <Chip label={`${available}/${total}`} color={color} size={size} sx={{ fontWeight: 600 }} />
  );
}

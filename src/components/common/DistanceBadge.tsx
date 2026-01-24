import Chip from '@mui/material/Chip';
import NavigationIcon from '@mui/icons-material/Navigation';
import { generateGoogleMapsDirectionsUrl } from '../../utils/maps';

interface DistanceBadgeProps {
  distanceKm: number | null;
  latitude: number;
  longitude: number;
  size?: 'small' | 'medium';
}

export function DistanceBadge({
  distanceKm,
  latitude,
  longitude,
  size = 'small',
}: DistanceBadgeProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = generateGoogleMapsDirectionsUrl(latitude, longitude);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const label = distanceKm !== null ? `Go to ${distanceKm.toFixed(2)} km` : 'Go to';

  return (
    <Chip
      icon={<NavigationIcon sx={{ fontSize: size === 'small' ? '0.875rem' : '1rem' }} />}
      label={label}
      size={size}
      color="success"
      variant="outlined"
      onClick={handleClick}
      sx={{
        cursor: 'pointer',
        fontWeight: 500,
        fontSize: size === 'small' ? '0.7rem' : '0.8rem',
        '& .MuiChip-icon': {
          color: 'inherit',
        },
      }}
    />
  );
}

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface SearchProgressBarProps {
  current: number;
  total: number;
}

export function SearchProgressBar({ current, total }: SearchProgressBarProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: 20,
        borderRadius: 10,
        bgcolor: 'grey.200',
        overflow: 'hidden',
        mb: 1,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: `${percentage}%`,
          borderRadius: 10,
          background: `repeating-linear-gradient(
            -45deg,
            #ffd54f,
            #ffd54f 10px,
            #ffecb3 10px,
            #ffecb3 20px
          )`,
          backgroundSize: '200% 100%',
          animation: 'stripes 1s linear infinite',
          transition: 'width 0.3s ease',
          '@keyframes stripes': {
            '0%': { backgroundPosition: '0 0' },
            '100%': { backgroundPosition: '28px 0' },
          },
        }}
      />
      <Typography
        variant="caption"
        sx={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          fontWeight: 600,
          fontSize: '0.75rem',
          color: percentage > 50 ? 'grey.800' : 'grey.600',
          zIndex: 1,
        }}
      >
        {percentage}%
      </Typography>
    </Box>
  );
}

import { Box, Skeleton, Stack } from '@mui/material';

export function LoadingSkeleton() {
  return (
    <Box sx={{ width: '100%' }}>
      {/* Available X/2 heading */}
      <Skeleton variant="rounded" width={140} height={28} sx={{ mb: 1, borderRadius: 1 }} />

      {/* Chips row */}
      <Stack direction="row" gap={0.5} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        <Skeleton variant="rounded" width={91} height={24} sx={{ borderRadius: '4px' }} />
        <Skeleton variant="rounded" width={101} height={24} sx={{ borderRadius: '4px' }} />
        <Skeleton variant="rounded" width={76} height={24} sx={{ borderRadius: '4px' }} />
      </Stack>

      {/* Location text */}
      <Skeleton variant="rounded" width={200} height={14} sx={{ mt: 0.5, borderRadius: 1 }} />

      {/* Station name */}
      <Skeleton variant="rounded" width="80%" height={20} sx={{ mt: 0.5, borderRadius: 1 }} />

      {/* Details text */}
      <Skeleton variant="rounded" width={133} height={14} sx={{ mt: 0.5, borderRadius: 1 }} />

      {/* Warning box */}
      <Skeleton
        variant="rounded"
        width="100%"
        height={30}
        sx={{
          borderRadius: 2,
          mt: 1,
          mb: 1,
        }}
      />

      {/* Ports row */}
      <Stack
        direction="row"
        spacing={1.5}
        justifyContent="space-between"
        alignItems="stretch"
        sx={{ mt: 1 }}
      >
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="rounded" width="100%" height={117} sx={{ borderRadius: 2 }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="rounded" width="100%" height={117} sx={{ borderRadius: 2 }} />
        </Box>
      </Stack>
    </Box>
  );
}

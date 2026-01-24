import { Box, Container, Skeleton, Stack } from '@mui/material';

export function LoadingSkeleton() {
  return (
    <Container
      maxWidth="sm"
      className="rounded-xl border border-gray-200 bg-white py-4 shadow-md"
      sx={{
        px: { xs: 2, sm: 3 },
        maxWidth: { xs: '100vw', sm: '600px' },
        minWidth: { sm: 378 },
        width: '100%',
      }}
    >
      <Box
        sx={{
          textAlign: 'start',
          width: '100%',
          maxWidth: { xs: '100%', sm: '400px' },
          pb: 1.5, // 12px to compensate for margin collapse differences
        }}
      >
        {/* Available X/2 heading - 328x32px real */}
        <Skeleton variant="rounded" width="100%" height={32} sx={{ mb: 1, borderRadius: 1 }} />

        {/* Chips row - 91+101+76x24px real vs 100+110+80x24px skeleton */}
        <Stack direction="row" gap={0.5} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
          <Skeleton variant="rounded" width={91} height={24} sx={{ borderRadius: '4px' }} />
          <Skeleton variant="rounded" width={101} height={24} sx={{ borderRadius: '4px' }} />
          <Skeleton variant="rounded" width={76} height={24} sx={{ borderRadius: '4px' }} />
        </Stack>

        {/* Location text - 105x14px real */}
        <Skeleton variant="rounded" width={105} height={14} sx={{ mt: 0.5, borderRadius: 1 }} />

        {/* Station name - 328x24px real */}
        <Skeleton variant="rounded" width="100%" height={24} sx={{ borderRadius: 1 }} />

        {/* Details text - 133x14px real */}
        <Skeleton variant="rounded" width={133} height={14} sx={{ borderRadius: 1 }} />

        {/* Show on map button - 134x33px real vs 140x36px skeleton */}
        <Stack sx={{ my: 1 }}>
          <Skeleton
            variant="rounded"
            width={134}
            height={33}
            sx={{ ml: 'auto', borderRadius: 1 }}
          />
        </Stack>

        {/* Warning box - 328x30px real vs 298x40px skeleton */}
        <Skeleton
          variant="rounded"
          width="100%"
          height={30}
          sx={{
            borderRadius: 2,
            mb: 1,
          }}
        />
      </Box>

      {/* Ports row - each port 187x117px */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        justifyContent="space-between"
        alignItems="stretch"
        sx={{ mt: 1 }}
      >
        {/* Port 1 */}
        <Box sx={{ width: { xs: '100%', sm: 187 } }}>
          <Skeleton variant="rounded" width="100%" height={117} sx={{ borderRadius: 2 }} />
        </Box>

        {/* Port 2 */}
        <Box sx={{ width: { xs: '100%', sm: 187 } }}>
          <Skeleton variant="rounded" width="100%" height={117} sx={{ borderRadius: 2 }} />
        </Box>
      </Stack>

      {/* Copyright - 119x20px, mt: 16px */}
      <Skeleton
        variant="rounded"
        width={119}
        height={20}
        sx={{ mt: 2, mx: 'auto', borderRadius: 1 }}
      />
    </Container>
  );
}

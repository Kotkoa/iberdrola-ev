# Component Conventions

## Functional Components Pattern

```typescript
import { FC } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export const MyComponent: FC<Props> = ({ prop }) => {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5">{prop}</Typography>
    </Box>
  );
};
```

## React Import Rules

**ALWAYS use named imports from React** - do not use `React.*` namespace access.

### ✅ Correct

```typescript
import { FC, useState, useEffect } from 'react';

const MyComponent: FC = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // ...
  }, []);
};
```

### ❌ Wrong

```typescript
import React from 'react';

const MyComponent: React.FC = () => {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    // ...
  }, []);
};
```

## Component Design Principles

**PREFER small, focused components and functions**

- Single responsibility per component
- Extract complex logic into custom hooks
- Keep components under 200 lines
- Break down large components into smaller ones

### Example: Refactor Large Component

```typescript
// ❌ Too large - everything in one component
const StationCard = () => {
  // 50 lines of state and logic
  // 100 lines of JSX
};

// ✅ Split into focused components
const StationCard = () => {
  const stationData = useStationData();
  return (
    <>
      <StationHeader {...stationData} />
      <StationPorts {...stationData} />
      <StationActions {...stationData} />
    </>
  );
};
```

## Styling

Combine MUI `sx` prop with Tailwind utility classes via `className`

## State Management

**No global state library** - use React hooks:

- `useState` - local state
- `useEffect` - side effects
- Custom hooks - reusable logic (see [hooks/useCharger.ts](../hooks/useCharger.ts))

## Constants Pattern

**All magic values go in [src/constants/index.ts](../src/constants/index.ts)**:

- API endpoints with CORS proxy
- Status enums (`CHARGING_POINT_STATUS`)
- Geographic calculations (`GEO_CONSTANTS`)
- Time intervals (`TIME_INTERVALS`)

### ✅ Use constants

```typescript
import { CHARGING_POINT_STATUS } from './constants';
if (status === CHARGING_POINT_STATUS.AVAILABLE) { ... }
```

### ❌ Avoid magic strings

```typescript
if (status === 'AVAILABLE') { ... }
```

## Data Loading Hooks

### Use `useStationData` for station loading

**Prefer `useStationData` over `useCharger`** (deprecated):

```typescript
import { useStationData } from '../hooks/useStationData';

function StationCard({ cpId, cuprId }: Props) {
  const { state, data, error, hasRealtime, isStale } = useStationData(cpId, cuprId);

  if (state === 'loading_cache' || state === 'loading_api') {
    return <Skeleton />;
  }

  if (state === 'error') {
    return <Error message={error} />;
  }

  return <StationDetails station={data} isStale={isStale} />;
}
```

### State Machine Pattern

**Prefer explicit states over boolean flags:**

```typescript
// ✅ Good: State machine
type State = 'idle' | 'loading_cache' | 'loading_api' | 'ready' | 'error';

// ❌ Avoid: Boolean flags
const [loading, setLoading] = useState(false);
const [error, setError] = useState(false);
const [hasData, setHasData] = useState(false);
```

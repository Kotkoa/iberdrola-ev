# Iberdrola EV Charger Monitor - AI Coding Instructions

## Project Overview

React + TypeScript PWA for monitoring Iberdrola EV charging stations. Real-time status tracking via Supabase, with push notifications and location-based features.

**Stack**: Vite 7, React 19, TypeScript 5.9, Material-UI 7, Tailwind CSS 4, Supabase

## Architecture Patterns

### Data Flow

```
Supabase (charge_logs_parsed) → useCharger hook → React state → UI
                                ↓
                         Real-time subscription
```

**Key files**:

- [api/charger.ts](api/charger.ts) - Supabase queries + real-time subscriptions
- [hooks/useCharger.ts](hooks/useCharger.ts) - React hook wrapping API calls
- [src/App.tsx](src/App.tsx) - Main component consuming data

#### Extended Data Fields

**Station metadata** (from Iberdrola API):

- `address_full` - Full address string (street, number, town, region)
- `situation_code` - Station status (OPER/MAINT/OOS)
- `emergency_stop_pressed` - Emergency stop indicator (boolean)
- `cp_latitude`, `cp_longitude` - Station coordinates

**Port details**:

- `port1_socket_type`, `port2_socket_type` - Socket type (e.g., "Mennekes (Type 2)")
- `port1_price_kwh`, `port2_price_kwh` - Charging price (€/kWh, 0 = free)
- `port1_power_kw`, `port2_power_kw` - Power rating (kW)

**Database schema**:

- `charge_logs_parsed` - Main table with latest status + extended fields
- `station_metadata` - Reference data (rarely changes): operator, serial number, address components, socket details (JSONB)
- `charging_stations_full` - View joining both tables (optional, for complex queries)

**UI display**:

- [ChargingStationInfo](src/components/ChargingStationInfo.tsx) - Shows address, emergency/maintenance alerts
- [PortCard](src/components/PortCard.tsx) - Shows socket type, pricing (FREE chip or €X.XXXX/kWh)
- [GetNearestChargingPointsButton](src/features/get-nearest-charging-points/GetNearestChargingPointsButton.tsx) - Uses extended fields in search results

### PWA & Push Notifications

Push notifications use Web Push API + service worker pattern:

```typescript
// Check support
isPushSupported() // from src/pwa.ts

// Subscribe flow
subscribeToStationNotifications(stationId, portNumber)
  → Request permission
  → Register service worker
  → Subscribe to push
  → Save to backend
```

**Service Worker**: [public/sw.js](public/sw.js) handles push events and notification clicks

**Environment variables needed**:

- `VITE_VAPID_PUBLIC_KEY` - Web Push public key
- `VITE_SAVE_SUBSCRIPTION_URL` - Backend endpoint for subscriptions
- `VITE_CHECK_SUB_URL` - Check existing subscriptions

### Geolocation Feature

[GetNearestChargingPointsButton](src/features/get-nearest-charging-points/GetNearestChargingPointsButton.tsx) demonstrates the pattern:

1. Request user location
2. Calculate bounding box using `GEO_CONSTANTS` from [src/constants/index.ts](src/constants/index.ts)
3. Fetch stations via CORS proxy
4. Filter by criteria (free, Type 2 connectors)
5. Fetch detailed status for each station

**CORS Proxy**: All Iberdrola API calls use `https://corsproxy.io/?` prefix (see [API_ENDPOINTS](src/constants/index.ts))

### CORS Proxy Limitations

This project uses `corsproxy.io` as a third-party CORS proxy for Iberdrola API calls.

**Important limitations:**

- Free tier is intended for development only
- Production use may require a paid subscription
- Rate limits exist (unspecified)
- Privacy: user geolocation passes through third-party
- Iberdrola blocks direct server-to-server requests (Edge Functions don't work)

**Alternatives considered:**

- Supabase Edge Functions: Blocked by Iberdrola
- Own Cloudflare Worker: Possible future migration

## TypeScript Rules

**Strict mode enabled** - check [tsconfig.app.json](tsconfig.app.json):

- Always provide explicit types
- No `any` types allowed
- Destructure with type annotations
- Use interfaces for component props

```typescript
// ✅ Correct
interface PortCardProps {
  portNumber: 1 | 2;
  isAvailable: boolean;
  powerKw: number | null;
}

// ❌ Wrong
const props: any = { ... }
```

## Component Conventions

### Functional Components + Material-UI

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

**Styling**: Combine MUI `sx` prop with Tailwind utility classes via `className`

### State Management

No global state library - use React hooks:

- `useState` for local state
- `useEffect` for side effects
- Custom hooks for reusable logic (see [hooks/useCharger.ts](hooks/useCharger.ts))

## Testing (Vitest)

**Setup**: [src/test/setup.ts](src/test/setup.ts) configures `@testing-library/jest-dom` and mocks

**Pattern** (see [src/utils/maps.test.ts](src/utils/maps.test.ts)):

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('Component', () => {
  it('should render correctly', () => {
    render(<Component />);
    expect(screen.getByText('text')).toBeInTheDocument();
  });
});
```

**Commands**:

- `npm run test` - watch mode
- `npm run test:run` - single run
- `npm run test:coverage` - coverage report

## Development Workflow

### Pre-commit Hooks (Husky + lint-staged)

Automatically runs on `git commit`:

1. Prettier format
2. ESLint fix
3. Vitest related tests

**Skip**: `git commit --no-verify` (not recommended)

### Post-Development Verification

After making code changes, always run TypeScript type checking on modified files:

```bash
npm run check-types
```

This ensures no type errors were introduced. Fix all errors before committing.

### Constants Pattern

All magic values go in [src/constants/index.ts](src/constants/index.ts):

- API endpoints with CORS proxy
- Status enums (`CHARGING_POINT_STATUS`)
- Geographic calculations (`GEO_CONSTANTS`)
- Time intervals (`TIME_INTERVALS`)

```typescript
// ✅ Use constants
import { CHARGING_POINT_STATUS } from './constants';
if (status === CHARGING_POINT_STATUS.AVAILABLE) { ... }

// ❌ Avoid magic strings
if (status === 'AVAILABLE') { ... }
```

### Error Handling

[ErrorBoundary](src/components/ErrorBoundary.tsx) catches React errors:

- Shows user-friendly message
- Displays stack trace in dev mode
- Provides reset button to reload app

**Usage**: Wrap root component in [src/main.tsx](src/main.tsx)

## Common Gotchas

1. **Environment Variables**: Must prefix with `VITE_` to expose to client code
2. **Supabase Auth**: [api/supabase.ts](api/supabase.ts) requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
3. **PWA Detection**: `isStandaloneApp()` checks both `display-mode: standalone` and `navigator.standalone`
4. **Real-time Updates**: [useCharger](hooks/useCharger.ts) subscribes to INSERT events on `charge_logs_parsed` table
5. **Duration Calculation**: UI updates every minute via `setInterval` - implemented in [App.tsx](src/App.tsx)

## Key Files Reference

| File                                             | Purpose                                   |
| ------------------------------------------------ | ----------------------------------------- |
| [src/App.tsx](src/App.tsx)                       | Main component, orchestrates all features |
| [api/charger.ts](api/charger.ts)                 | Supabase data fetching + subscriptions    |
| [src/pwa.ts](src/pwa.ts)                         | PWA utilities, push notifications         |
| [src/constants/index.ts](src/constants/index.ts) | All constants, API endpoints              |
| [types/charger.ts](types/charger.ts)             | Core data model                           |
| [vite.config.ts](vite.config.ts)                 | Build configuration                       |

## Build Commands

```bash
npm run dev      # Development server (port 5173)
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # ESLint check
npm run format   # Prettier format
```

**Note**: Package manager is yarn

## Code Comments

- Do not use comments unless absolutely necessary.
- **All code comments must ALWAYS be in English** - this includes comments in TypeScript, JavaScript, JSX, TSX, CSS, and any other code files.
- Only meaningful comments should be added.

## Chat Responses

- All information in chat replies (natural language responses to user questions) should be in Russian.
- **Exception**: Code itself and code comments must always be in English, regardless of the chat language.

mui-mcp

Always use the MUI MCP server when working with Material UI components, theming, styling, or MUI-specific APIs and patterns.

context7

Always use the Context7 MCP server to retrieve up-to-date documentation, examples, and best practices for third-party libraries and frameworks.

chrome-devtools

Always use the Chrome DevTools MCP server when debugging frontend issues, analyzing performance, inspecting DOM, or working with browser runtime behavior.

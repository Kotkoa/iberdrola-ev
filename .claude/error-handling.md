# Error Handling

## ErrorBoundary Component

**Location**: [src/components/ErrorBoundary.tsx](../src/components/ErrorBoundary.tsx)

**Features**:

- Shows user-friendly message
- Displays stack trace in dev mode
- Provides reset button to reload app

**Usage**: Wrap root component in [src/main.tsx](../src/main.tsx)

## Common Gotchas

### 1. Environment Variables

- **Must prefix with `VITE_`** to expose to client code

### 2. Supabase Auth

- [api/supabase.ts](../api/supabase.ts) requires:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### 3. PWA Detection

- Use `isStandaloneApp()` - checks both `display-mode: standalone` and `navigator.standalone`

### 4. Real-time Updates

- [useCharger](../hooks/useCharger.ts) subscribes to INSERT events on `station_snapshots` table

### 5. Duration Calculation

- UI updates every minute via `setInterval`
- Implemented in [App.tsx](../src/App.tsx)

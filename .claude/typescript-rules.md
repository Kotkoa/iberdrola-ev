# TypeScript Rules

## Strict Mode Configuration

**Check**: [tsconfig.app.json](../tsconfig.app.json)

## Mandatory Rules

1. **Always provide explicit types**
2. **No `any` types allowed**
3. **Destructure with type annotations**
4. **Use interfaces for component props**
5. **AVOID `unknown` type** - indicates wrong data structure or typing approach

## Examples

### ✅ Correct

```typescript
interface PortCardProps {
  portNumber: 1 | 2;
  isAvailable: boolean;
  powerKw: number | null;
}

const MyComponent: FC<PortCardProps> = ({ portNumber, isAvailable, powerKw }) => {
  // ...
};
```

### ❌ Wrong

```typescript
const props: any = { ... }
```

## Function Design Pattern

**ALWAYS** prefer named parameters (options object) over positional arguments.

Use positional parameters only for single-argument or universally obvious cases.

### ✅ Correct - Named Parameters

```typescript
interface FetchStationOptions {
  cpId: string;
  includeHistory?: boolean;
  maxRetries?: number;
}

function fetchStation({ cpId, includeHistory = false, maxRetries = 3 }: FetchStationOptions) {
  // Clear what each parameter represents
}

// Usage
fetchStation({ cpId: 'ABC123', includeHistory: true });
```

### ✅ Correct - Simple Cases (Positional OK)

```typescript
// Single argument
function formatPrice(price: number): string { ... }

// Universally obvious
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number { ... }
```

### ❌ Wrong - Multiple Positional Arguments

```typescript
// Hard to understand at call site
function fetchStation(cpId: string, includeHistory: boolean, maxRetries: number, timeout: number) { ... }

// Usage - what do these booleans/numbers mean?
fetchStation('ABC123', true, 3, 5000);
```

## Type Checking Command

**Always run after making code changes**:

```bash
npm run check-types
```

Fix all errors before committing.

# Testing (Vitest)

## Setup

[src/test/setup.ts](../src/test/setup.ts) configures `@testing-library/jest-dom` and mocks

## Test Pattern

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

**Example**: [src/utils/maps.test.ts](../src/utils/maps.test.ts)

## Testable Elements

**USE `data-test` attributes** for elements that need to be tested.

This provides stable selectors that won't break when changing class names or text content.

### ✅ Correct

```typescript
// Component
export const StationCard: FC<Props> = ({ stationId }) => {
  return (
    <Card data-test="station-card">
      <Typography data-test="station-id">{stationId}</Typography>
      <Button data-test="favorite-button">Add to Favorites</Button>
    </Card>
  );
};

// Test
it('should display station ID', () => {
  render(<StationCard stationId="ABC123" />);
  expect(screen.getByTestId('station-id')).toHaveTextContent('ABC123');
});

it('should have favorite button', () => {
  render(<StationCard stationId="ABC123" />);
  const button = screen.getByTestId('favorite-button');
  expect(button).toBeInTheDocument();
});
```

### ❌ Wrong - Brittle Selectors

```typescript
// Test that breaks when changing class or text
it('should display station ID', () => {
  render(<StationCard stationId="ABC123" />);
  expect(screen.getByClassName('station-id-text')).toHaveTextContent('ABC123');
});
```

## Commands

```bash
yarn test           # Run tests in watch mode
yarn test:run       # Run tests once
yarn test:ui        # Run tests with UI
yarn test:coverage  # Run tests with coverage
```

## Testing Guide

See [src/test/README.md](../src/test/README.md) for detailed testing guide.

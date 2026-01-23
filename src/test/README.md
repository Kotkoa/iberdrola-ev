# Testing Guide

## Overview

This project uses **Vitest** as the test runner and **React Testing Library** for component testing.

## Running Tests

```bash
# Run tests in watch mode
yarn test

# Run tests once
yarn test:run

# Run tests with UI
yarn test:ui

# Run tests with coverage
yarn test:coverage
```

## Test Structure

- `src/test/setup.ts` - Global test setup and configuration
- `*.test.ts` - Unit tests for utilities and functions
- `*.test.tsx` - Component tests

## Writing Tests

### Unit Tests (Utilities)

```typescript
import { describe, it, expect } from 'vitest'
import { generateGoogleMapsUrl } from './maps'

describe('generateGoogleMapsUrl', () => {
  it('should generate URL without zoom', () => {
    const url = generateGoogleMapsUrl(38.839266, -0.120815)
    expect(url).toBe('https://www.google.com/maps?q=38.839266,-0.120815')
  })
})
```

### Component Tests

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Copyright from './Copyright'

describe('Copyright', () => {
  it('should render copyright text', () => {
    render(<Copyright />)
    const text = screen.getByText(/Copyright ©/i)
    expect(text).toBeInTheDocument()
  })
})
```

## Best Practices

1. **Test behavior, not implementation** - Focus on what the user sees and does
2. **Use accessible queries** - Prefer `getByRole`, `getByLabelText` over `getByTestId`
3. **Keep tests simple** - One assertion per test when possible
4. **Use descriptive test names** - Describe what should happen
5. **Mock external dependencies** - Keep tests isolated and fast

## Configuration

- **vitest.config.ts** - Vitest configuration
- **src/test/setup.ts** - Global test setup (mocks, polyfills)

## Coverage

Coverage reports are generated in `coverage/` directory.

Target coverage: 80%+ for critical paths

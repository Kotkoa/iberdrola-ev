import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from './ErrorBoundary';

vi.mock('../../api/charger.js', () => ({
  unsubscribeAllChannels: vi.fn(),
}));

import { unsubscribeAllChannels } from '../../api/charger.js';

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  // Suppress console.error for these tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  it('should render children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('should render error UI when child component throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Who-ops')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong. Please try again later.')).toBeInTheDocument();
  });

  it('should show error icon when error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const icon = document.querySelector('[data-testid="ErrorOutlineIcon"]');
    expect(icon).toBeInTheDocument();
  });

  it('should show reset button when error occurs', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const resetButton = screen.getByRole('button', { name: /Close/i });
    expect(resetButton).toBeInTheDocument();
  });

  it('should unsubscribe from all channels and reload page when reset button is clicked', async () => {
    const user = userEvent.setup();
    const mockUnsubscribe = vi.mocked(unsubscribeAllChannels);
    mockUnsubscribe.mockClear();

    const originalHref = window.location.href;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const resetButton = screen.getByRole('button', { name: /Close/i });
    await user.click(resetButton);

    expect(mockUnsubscribe).toHaveBeenCalledOnce();
    expect(window.location.href).toBe('/');

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: originalHref },
    });
  });

  it('should not show error details in production', () => {
    const originalEnv = import.meta.env.DEV;
    import.meta.env.DEV = false;

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const errorDetails = screen.queryByText(/Test error/i);
    expect(errorDetails).not.toBeInTheDocument();

    import.meta.env.DEV = originalEnv;
  });
});

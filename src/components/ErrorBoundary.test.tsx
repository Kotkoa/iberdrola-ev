import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from './ErrorBoundary';

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

    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
    expect(
      screen.getByText('Произошла непредвиденная ошибка. Пожалуйста, попробуйте обновить страницу.')
    ).toBeInTheDocument();
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

    const resetButton = screen.getByRole('button', { name: /вернуться на главную/i });
    expect(resetButton).toBeInTheDocument();
  });

  it('should reload page when reset button is clicked', async () => {
    const user = userEvent.setup();

    // Mock window.location.href
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

    const resetButton = screen.getByRole('button', { name: /вернуться на главную/i });
    await user.click(resetButton);

    expect(window.location.href).toBe('/');

    // Restore window.location
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

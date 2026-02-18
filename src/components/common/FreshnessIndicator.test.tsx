import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FreshnessIndicator } from './FreshnessIndicator';

describe('FreshnessIndicator', () => {
  it('should show green chip when data is fresh', () => {
    const recentTime = new Date(Date.now() - 2 * 60_000).toISOString(); // 2 min ago

    render(
      <FreshnessIndicator
        observedAt={recentTime}
        isStale={false}
        scraperTriggered={false}
        isRateLimited={false}
      />
    );

    const chip = screen.getByTestId('freshness-indicator');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('min');
    expect(chip).toHaveClass('MuiChip-colorSuccess');
  });

  it('should show yellow "Updating..." when stale and scraper triggered', () => {
    const oldTime = new Date(Date.now() - 30 * 60_000).toISOString(); // 30 min ago

    render(
      <FreshnessIndicator
        observedAt={oldTime}
        isStale={true}
        scraperTriggered={true}
        isRateLimited={false}
      />
    );

    const chip = screen.getByTestId('freshness-indicator');
    expect(chip).toHaveTextContent('Updating...');
    expect(chip).toHaveClass('MuiChip-colorWarning');
  });

  it('should show yellow chip with age when stale but not updating', () => {
    const oldTime = new Date(Date.now() - 25 * 60_000).toISOString(); // 25 min ago

    render(
      <FreshnessIndicator
        observedAt={oldTime}
        isStale={true}
        scraperTriggered={false}
        isRateLimited={false}
      />
    );

    const chip = screen.getByTestId('freshness-indicator');
    expect(chip).toHaveTextContent('25 min');
    expect(chip).toHaveClass('MuiChip-colorWarning');
  });

  it('should show gray chip when rate limited', () => {
    const oldTime = new Date(Date.now() - 10 * 60_000).toISOString(); // 10 min ago

    render(
      <FreshnessIndicator
        observedAt={oldTime}
        isStale={true}
        scraperTriggered={false}
        isRateLimited={true}
      />
    );

    const chip = screen.getByTestId('freshness-indicator');
    expect(chip).toHaveTextContent('10 min');
    expect(chip).toHaveClass('MuiChip-colorDefault');
  });

  it('should return null when observedAt is null', () => {
    const { container } = render(
      <FreshnessIndicator
        observedAt={null}
        isStale={false}
        scraperTriggered={false}
        isRateLimited={false}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});

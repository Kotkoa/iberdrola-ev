import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchResults } from './SearchResults';
import type { StationInfoPartial } from '../../services/iberdrola';

vi.mock('../../utils/maps', () => ({
  calculateDistance: vi.fn((...args: number[]) => args[2] * 0.1),
  generateGoogleMapsDirectionsUrl: vi.fn(() => 'https://maps.google.com'),
}));

function makeStation(overrides: Partial<StationInfoPartial> = {}): StationInfoPartial {
  const cpId = overrides.cpId ?? Math.floor(Math.random() * 100000);
  return {
    cpId,
    cuprId: cpId + 1000,
    name: `Station ${cpId}`,
    latitude: 38.84,
    longitude: -0.12,
    addressFull: `Street ${cpId}, CITY, PROVINCE`,
    overallStatus: 'AVAILABLE',
    totalPorts: 2,
    priceKwh: 0,
    verificationState: 'verified_free',
    ...overrides,
  };
}

const defaultProps = {
  primaryStationId: null,
  onSetPrimary: vi.fn(),
  userLocation: { latitude: 38.84, longitude: -0.12 },
  showPaid: false,
};

describe('SearchResults', () => {
  it('renders all station cards for given stations', () => {
    const stations = Array.from({ length: 5 }, (_, index) => makeStation({ cpId: 1000 + index }));

    render(<SearchResults stations={stations} {...defaultProps} />);

    const starButtons = screen.getAllByRole('button', { name: 'Set as primary' });
    expect(starButtons).toHaveLength(5);
  });

  it('sorts stations by distance (nearest first)', () => {
    const stations = [
      makeStation({ cpId: 1, latitude: 50, addressFull: 'Far Street, FAR, CITY' }),
      makeStation({ cpId: 2, latitude: 10, addressFull: 'Near Street, NEAR, CITY' }),
      makeStation({ cpId: 3, latitude: 30, addressFull: 'Mid Street, MID, CITY' }),
    ];

    render(<SearchResults stations={stations} {...defaultProps} />);

    const distanceChips = screen.getAllByText(/Go to/);
    expect(distanceChips[0]).toHaveTextContent('1.00 km');
    expect(distanceChips[1]).toHaveTextContent('3.00 km');
    expect(distanceChips[2]).toHaveTextContent('5.00 km');
  });

  it('hides verified_paid stations', () => {
    const stations = [
      makeStation({ cpId: 1, verificationState: 'verified_free' }),
      makeStation({ cpId: 2, verificationState: 'verified_paid' }),
      makeStation({ cpId: 3, verificationState: 'verified_free' }),
    ];

    render(<SearchResults stations={stations} {...defaultProps} showPaid={false} />);

    const starButtons = screen.getAllByRole('button', { name: 'Set as primary' });
    expect(starButtons).toHaveLength(2);
  });

  it('shows empty state when all stations are verified_paid', () => {
    const stations = [
      makeStation({ cpId: 1, verificationState: 'verified_paid' }),
      makeStation({ cpId: 2, verificationState: 'verified_paid' }),
    ];

    render(<SearchResults stations={stations} {...defaultProps} showPaid={false} />);

    expect(screen.getByText(/No free charging stations found/)).toBeInTheDocument();
  });
});

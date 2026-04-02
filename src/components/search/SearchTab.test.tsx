import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchTab } from './SearchTab';
import type { StationInfoPartial } from '../../services/iberdrola';
import type { UseStationSearchReturn } from '../../hooks/useStationSearch';

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

const mockSearch = vi.fn();
const mockClear = vi.fn();

let mockSearchReturn: UseStationSearchReturn = {
  stations: [],
  loading: false,
  error: null,
  usingCachedData: false,
  scraperTriggered: false,
  search: mockSearch,
  clear: mockClear,
};

vi.mock('../../hooks/useStationSearch', () => ({
  useStationSearch: () => mockSearchReturn,
}));

vi.mock('../../context/PrimaryStationContext', () => ({
  usePrimaryStation: () => ({
    primaryStationId: null,
    primaryStation: null,
    loading: false,
    error: null,
    setPrimaryStation: vi.fn(),
  }),
}));

vi.mock('../../hooks/useUserLocation', () => ({
  useUserLocation: () => ({
    location: { latitude: 38.84, longitude: -0.12 },
    error: null,
    loading: false,
  }),
}));

vi.mock('../../utils/maps', () => ({
  calculateDistance: vi.fn(() => 2.5),
  generateGoogleMapsDirectionsUrl: vi.fn(() => 'https://maps.google.com'),
}));

beforeEach(() => {
  mockSearchReturn = {
    stations: [],
    loading: false,
    error: null,
    usingCachedData: false,
    scraperTriggered: false,
    search: mockSearch,
    clear: mockClear,
  };
});

describe('SearchTab', () => {
  it('renders all station cards when search returns many results', () => {
    const stations = Array.from({ length: 6 }, (_, index) => makeStation({ cpId: 1000 + index }));
    mockSearchReturn = { ...mockSearchReturn, stations };

    render(<SearchTab />);

    const starButtons = screen.getAllByRole('button', { name: 'Set as primary' });
    expect(starButtons).toHaveLength(6);
  });

  it('shows empty state when no stations found', () => {
    mockSearchReturn = { ...mockSearchReturn, stations: [], loading: false };

    render(<SearchTab />);

    expect(screen.getByText('No stations found in this area.')).toBeInTheDocument();
  });

  it('shows scraper triggered alert', () => {
    mockSearchReturn = {
      ...mockSearchReturn,
      stations: [makeStation()],
      scraperTriggered: true,
      loading: false,
    };

    render(<SearchTab />);

    expect(screen.getByText('Updating station data...')).toBeInTheDocument();
  });

  it('shows error alert when search fails', () => {
    mockSearchReturn = {
      ...mockSearchReturn,
      error: 'Network error',
      stations: [],
    };

    render(<SearchTab />);

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('does not show empty state when stations are present', () => {
    const stations = Array.from({ length: 6 }, (_, index) => makeStation({ cpId: 2000 + index }));
    mockSearchReturn = { ...mockSearchReturn, stations };

    render(<SearchTab />);

    expect(screen.queryByText('No stations found in this area.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Set as primary' })).toHaveLength(6);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchStationDetails, extractStationInfo, type StationDetails } from './iberdrola';

// Mock rate limiter to avoid delays in tests
vi.mock('../utils/rateLimiter', () => ({
  RateLimiter: class {
    async acquire() {
      return Promise.resolve();
    }
    release() {}
  },
}));

describe('fetchStationDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch station details successfully', async () => {
    const mockResponse = {
      entidad: [
        {
          cpStatus: { statusCode: 'AVAILABLE' },
          logicalSocket: [],
          locationData: { cuprName: 'Test Station' },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchStationDetails(12345);

    expect(result).toEqual(mockResponse.entidad[0]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('getDatosPuntoRecarga'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('12345'),
      })
    );
  });

  it('should throw on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    });

    await expect(fetchStationDetails(12345)).rejects.toThrow(
      'Failed to fetch station details: 403'
    );
  });

  it('should return null if no entity in response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entidad: [] }),
    });

    const result = await fetchStationDetails(12345);
    expect(result).toBeNull();
  });

  it('should return null if entidad is undefined', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const result = await fetchStationDetails(12345);
    expect(result).toBeNull();
  });
});

describe('extractStationInfo', () => {
  it('should extract station info from valid details', () => {
    const details: StationDetails = {
      cpStatus: { statusCode: 'AVAILABLE' },
      logicalSocket: [
        {
          physicalSocket: [
            {
              status: { statusCode: 'AVAILABLE' },
              maxPower: 50,
              appliedRate: { recharge: { finalPrice: 0 } },
              socketType: { socketName: 'Type 2', socketTypeId: '2' },
            },
          ],
        },
      ],
      locationData: {
        cuprName: 'Test Station',
        latitude: 38.8398,
        longitude: -0.1197,
        supplyPointData: {
          cpAddress: {
            streetName: 'Main St',
            streetNum: '123',
            townName: 'Pego',
            regionName: 'Alicante',
          },
        },
      },
    };

    const result = extractStationInfo(1, 2, details);

    expect(result).toBeDefined();
    expect(result?.cpId).toBe(1);
    expect(result?.cuprId).toBe(2);
    expect(result?.name).toBe('Test Station');
    expect(result?.latitude).toBe(38.8398);
    expect(result?.longitude).toBe(-0.1197);
    expect(result?.maxPower).toBe(50);
    expect(result?.freePorts).toBe(1);
    expect(result?.priceKwh).toBe(0);
    expect(result?.socketType).toContain('Type 2');
    expect(result?.addressFull).toContain('Main St');
  });

  it('should return null for null details', () => {
    expect(extractStationInfo(1, 2, null)).toBeNull();
  });

  it('should handle missing location data gracefully', () => {
    const details: StationDetails = {
      cpStatus: { statusCode: 'AVAILABLE' },
      logicalSocket: [],
    };

    const result = extractStationInfo(1, 2, details);

    expect(result).toBeDefined();
    expect(result?.name).toBe('Unknown');
    expect(result?.latitude).toBe(0);
    expect(result?.longitude).toBe(0);
    expect(result?.addressFull).toBe('Address unknown');
  });

  it('should calculate free ports correctly', () => {
    const details: StationDetails = {
      cpStatus: { statusCode: 'AVAILABLE' },
      logicalSocket: [
        {
          physicalSocket: [
            { status: { statusCode: 'AVAILABLE' }, maxPower: 50 },
            { status: { statusCode: 'OCCUPIED' }, maxPower: 50 },
            { status: { statusCode: 'AVAILABLE' }, maxPower: 22 },
          ],
        },
      ],
    };

    const result = extractStationInfo(1, 2, details);

    expect(result?.freePorts).toBe(2);
    expect(result?.maxPower).toBe(50);
  });

  it('should calculate minimum price across sockets', () => {
    const details: StationDetails = {
      cpStatus: { statusCode: 'AVAILABLE' },
      logicalSocket: [
        {
          physicalSocket: [
            { appliedRate: { recharge: { finalPrice: 0.45 } } },
            { appliedRate: { recharge: { finalPrice: 0.35 } } },
            { appliedRate: { recharge: { finalPrice: 0.5 } } },
          ],
        },
      ],
    };

    const result = extractStationInfo(1, 2, details);

    expect(result?.priceKwh).toBe(0.35);
  });

  it('should handle missing prices gracefully', () => {
    const details: StationDetails = {
      cpStatus: { statusCode: 'AVAILABLE' },
      logicalSocket: [
        {
          physicalSocket: [{ status: { statusCode: 'AVAILABLE' } }],
        },
      ],
    };

    const result = extractStationInfo(1, 2, details);

    expect(result?.priceKwh).toBe(0);
  });

  it('should detect emergency stop pressed', () => {
    const details: StationDetails = {
      cpStatus: { statusCode: 'AVAILABLE' },
      emergencyStopButtonPressed: true,
      logicalSocket: [],
    };

    const result = extractStationInfo(1, 2, details);

    expect(result?.emergencyStopPressed).toBe(true);
  });

  it('should detect reservation support', () => {
    const details: StationDetails = {
      cpStatus: { statusCode: 'AVAILABLE' },
      locationData: {
        cuprReservationIndicator: true,
      },
      logicalSocket: [],
    };

    const result = extractStationInfo(1, 2, details);

    expect(result?.supportsReservation).toBe(true);
  });
});

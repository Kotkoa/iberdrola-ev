import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchStationDetails, extractStationInfo, type StationDetails } from './iberdrola';
import { VERCEL_PROXY_ENDPOINT, API_ENDPOINTS, IBERDROLA_DIRECT_ENDPOINTS } from '../constants';

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

  it('should fetch station details via Vercel proxy first', async () => {
    const mockResponse = {
      entidad: [
        {
          cpStatus: { statusCode: 'AVAILABLE' },
          logicalSocket: [],
          locationData: { cuprName: 'Test Station' },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchStationDetails(12345);

    expect(result).toEqual(mockResponse.entidad[0]);
    // First call should be to Vercel proxy
    expect(fetch).toHaveBeenCalledWith(
      VERCEL_PROXY_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('details'),
      })
    );
  });

  it('should fallback to CORS proxy when Vercel proxy fails', async () => {
    const mockResponse = {
      entidad: [
        {
          cpStatus: { statusCode: 'AVAILABLE' },
          logicalSocket: [],
          locationData: { cuprName: 'Test Station' },
        },
      ],
    };

    // First call (Vercel) fails, second call (CORS proxy) succeeds
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Vercel proxy error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

    const result = await fetchStationDetails(12345);

    expect(result).toEqual(mockResponse.entidad[0]);
    expect(fetch).toHaveBeenCalledTimes(2);
    // Second call should be to CORS proxy
    expect(fetch).toHaveBeenLastCalledWith(
      API_ENDPOINTS.GET_CHARGING_POINT_DETAILS,
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('should return null when all methods fail', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Vercel proxy error'))
      .mockRejectedValueOnce(new Error('CORS proxy error'))
      .mockRejectedValueOnce(new Error('Direct fetch error'));

    const result = await fetchStationDetails(12345);

    expect(result).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('should return null if no entity in response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entidad: [] }),
    });

    const result = await fetchStationDetails(12345);
    expect(result).toBeNull();
  });

  it('should return null if entidad is undefined', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const result = await fetchStationDetails(12345);
    expect(result).toBeNull();
  });

  it('should fallback to direct fetch when both proxies fail', async () => {
    const mockResponse = {
      entidad: [
        {
          cpStatus: { statusCode: 'AVAILABLE' },
          logicalSocket: [],
          locationData: { cuprName: 'Test Station' },
        },
      ],
    };

    // Vercel fails, CORS fails, Direct succeeds
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Vercel proxy error'))
      .mockRejectedValueOnce(new Error('CORS proxy error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

    const result = await fetchStationDetails(12345);

    expect(result).toEqual(mockResponse.entidad[0]);
    expect(fetch).toHaveBeenCalledTimes(3);
    // Third call should be to direct Iberdrola endpoint
    expect(fetch).toHaveBeenLastCalledWith(
      IBERDROLA_DIRECT_ENDPOINTS.GET_CHARGING_POINT_DETAILS,
      expect.objectContaining({
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
      })
    );
  });

  it('should call direct fetch with correct headers', async () => {
    const mockResponse = {
      entidad: [
        {
          cpStatus: { statusCode: 'AVAILABLE' },
          logicalSocket: [],
        },
      ],
    };

    // Vercel fails, CORS fails, Direct succeeds
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Vercel proxy error'))
      .mockRejectedValueOnce(new Error('CORS proxy error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

    await fetchStationDetails(12345);

    // Verify direct fetch call has correct headers
    const directFetchCall = vi.mocked(fetch).mock.calls[2];
    const directFetchOptions = directFetchCall[1] as RequestInit;

    expect(directFetchOptions.method).toBe('POST');
    expect(directFetchOptions.mode).toBe('cors');
    expect(directFetchOptions.credentials).toBe('omit');
    expect(directFetchOptions.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    });
  });

  it('should verify fallback order: Vercel -> CORS -> Direct -> null', async () => {
    // All methods fail
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Vercel proxy error'))
      .mockRejectedValueOnce(new Error('CORS proxy error'))
      .mockRejectedValueOnce(new Error('Direct fetch error'));

    const result = await fetchStationDetails(12345);

    expect(result).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);

    // Verify call order
    const calls = vi.mocked(fetch).mock.calls;

    // 1st call: Vercel proxy
    expect(calls[0][0]).toBe(VERCEL_PROXY_ENDPOINT);

    // 2nd call: CORS proxy
    expect(calls[1][0]).toBe(API_ENDPOINTS.GET_CHARGING_POINT_DETAILS);

    // 3rd call: Direct Iberdrola endpoint
    expect(calls[2][0]).toBe(IBERDROLA_DIRECT_ENDPOINTS.GET_CHARGING_POINT_DETAILS);
  });

  describe('direct fetch timeout', () => {
    it('should abort direct fetch when signal is triggered', async () => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError');

      // Vercel fails, CORS fails, Direct aborts due to timeout
      globalThis.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Vercel proxy error'))
        .mockRejectedValueOnce(new Error('CORS proxy error'))
        .mockRejectedValueOnce(abortError);

      const result = await fetchStationDetails(12345);

      expect(result).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should pass AbortSignal to direct fetch', async () => {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Vercel proxy error'))
        .mockRejectedValueOnce(new Error('CORS proxy error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ entidad: [{ cpStatus: { statusCode: 'AVAILABLE' } }] }),
        });

      await fetchStationDetails(12345);

      // Verify direct fetch was called with signal
      const directFetchCall = vi.mocked(fetch).mock.calls[2];
      const directFetchOptions = directFetchCall[1] as RequestInit;

      expect(directFetchOptions.signal).toBeInstanceOf(AbortSignal);
    });

    it('should configure direct fetch with 5s timeout via AbortController', async () => {
      // Mock AbortController to verify timeout is set correctly
      const originalAbortController = globalThis.AbortController;
      const mockAbort = vi.fn();
      const mockSignal = { aborted: false } as AbortSignal;

      class MockAbortController {
        signal = mockSignal;
        abort = mockAbort;
      }

      globalThis.AbortController = MockAbortController as unknown as typeof AbortController;

      // Track setTimeout calls to verify 5s timeout
      const originalSetTimeout = globalThis.setTimeout;
      let capturedTimeout = 0;
      globalThis.setTimeout = vi.fn((fn: () => void, ms: number) => {
        capturedTimeout = ms;
        return originalSetTimeout(fn, 0); // Execute immediately in test
      }) as unknown as typeof setTimeout;

      globalThis.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Vercel proxy error'))
        .mockRejectedValueOnce(new Error('CORS proxy error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ entidad: [{ cpStatus: { statusCode: 'AVAILABLE' } }] }),
        });

      await fetchStationDetails(12345);

      // Verify 5s timeout was configured
      expect(capturedTimeout).toBe(5000);

      // Restore globals
      globalThis.AbortController = originalAbortController;
      globalThis.setTimeout = originalSetTimeout;
    });
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

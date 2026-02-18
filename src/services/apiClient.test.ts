import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollStation, startWatch } from './apiClient';
import {
  isApiSuccess,
  isRateLimited,
  isApiError,
  type ApiResponse,
  type PollStationData,
  type StartWatchData,
} from '../types/api';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('apiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('pollStation', () => {
    it('returns success response with station data', async () => {
      const mockData: PollStationData = {
        cp_id: 12345,
        port1_status: 'Available',
        port2_status: 'Occupied',
        port1_update_date: null,
        port2_update_date: null,
        overall_status: 'PartiallyOccupied',
        observed_at: '2025-01-31T10:30:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true, data: mockData }),
      });

      const response = await pollStation(144569);

      // Verify fetch was called with correct endpoint and body
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/functions/v1/poll-station');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ cupr_id: 144569 });

      expect(response.ok).toBe(true);
      if (isApiSuccess(response)) {
        expect(response.data.cp_id).toBe(12345);
        expect(response.data.port1_status).toBe('Available');
      }
    });

    it('handles rate limit response', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            ok: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many requests',
              retry_after: 300,
            },
          }),
      });

      const response = await pollStation(144569);

      expect(response.ok).toBe(false);
      expect(isRateLimited(response)).toBe(true);
      if (isRateLimited(response)) {
        expect(response.error.retry_after).toBe(300);
      }
    });

    it('handles network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const response = await pollStation(144569);

      expect(response.ok).toBe(false);
      expect(isApiError(response)).toBe(true);
      if (isApiError(response)) {
        expect(response.error.code).toBe('INTERNAL_ERROR');
        expect(response.error.message).toBe('Network error');
      }
    });

    it('handles NOT_FOUND error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            ok: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Station not found',
            },
          }),
      });

      const response = await pollStation(999999);

      expect(response.ok).toBe(false);
      if (isApiError(response)) {
        expect(response.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('startWatch', () => {
    const validRequest = {
      cupr_id: 144569,
      port: 1 as const,
      subscription: {
        endpoint: 'https://fcm.googleapis.com/...',
        keys: {
          p256dh: 'BNc...',
          auth: 'tBH...',
        },
      },
    };

    it('creates subscription and returns task info', async () => {
      const mockData: StartWatchData = {
        subscription_id: 'sub-uuid',
        task_id: 'task-uuid',
        current_status: {
          port1_status: 'Occupied',
          port2_status: 'Available',
          observed_at: '2025-01-31T10:30:00Z',
        },
        fresh: true,
        next_poll_in: null,
      };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true, data: mockData }),
      });

      const response = await startWatch(validRequest);

      // Verify fetch was called with correct endpoint and body
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/functions/v1/start-watch');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual(validRequest);

      expect(response.ok).toBe(true);
      if (isApiSuccess(response)) {
        expect(response.data.subscription_id).toBe('sub-uuid');
        expect(response.data.fresh).toBe(true);
      }
    });

    it('returns fresh=false when rate limited', async () => {
      const mockData: StartWatchData = {
        subscription_id: 'sub-uuid',
        task_id: 'task-uuid',
        current_status: {
          port1_status: 'Occupied',
          port2_status: 'Available',
          observed_at: '2025-01-31T10:27:00Z',
        },
        fresh: false,
        next_poll_in: 180,
      };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true, data: mockData }),
      });

      const response = await startWatch(validRequest);

      expect(response.ok).toBe(true);
      if (isApiSuccess(response)) {
        expect(response.data.fresh).toBe(false);
        expect(response.data.next_poll_in).toBe(180);
      }
    });

    it('handles validation error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid subscription endpoint',
            },
          }),
      });

      const response = await startWatch({
        ...validRequest,
        subscription: { ...validRequest.subscription, endpoint: '' },
      });

      expect(response.ok).toBe(false);
      if (isApiError(response)) {
        expect(response.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('type guards', () => {
    it('isApiSuccess correctly identifies success response', () => {
      const success: ApiResponse<{ value: number }> = {
        ok: true,
        data: { value: 42 },
      };
      const error: ApiResponse<{ value: number }> = {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Error' },
      };

      expect(isApiSuccess(success)).toBe(true);
      expect(isApiSuccess(error)).toBe(false);
    });

    it('isRateLimited correctly identifies rate limit response', () => {
      const rateLimited: ApiResponse<unknown> = {
        ok: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests', retry_after: 300 },
      };
      const otherError: ApiResponse<unknown> = {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      };
      const success: ApiResponse<unknown> = {
        ok: true,
        data: {},
      };

      expect(isRateLimited(rateLimited)).toBe(true);
      expect(isRateLimited(otherError)).toBe(false);
      expect(isRateLimited(success)).toBe(false);
    });

    it('isApiError correctly identifies any error response', () => {
      const error: ApiResponse<unknown> = {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Error' },
      };
      const success: ApiResponse<unknown> = {
        ok: true,
        data: {},
      };

      expect(isApiError(error)).toBe(true);
      expect(isApiError(success)).toBe(false);
    });
  });
});

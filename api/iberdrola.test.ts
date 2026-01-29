import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import the handler - need to test the module
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Dynamic import to get fresh module
async function getHandler() {
  vi.resetModules();
  const module = await import('./iberdrola');
  return module.default;
}

function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    body: {},
    ...overrides,
  } as VercelRequest;
}

function createMockResponse(): VercelResponse & {
  _status: number;
  _json: unknown;
  _headers: Record<string, string>;
  _ended: boolean;
} {
  const res = {
    _status: 200,
    _json: null as unknown,
    _headers: {} as Record<string, string>,
    _ended: false,
    setHeader(name: string, value: string) {
      this._headers[name] = value;
      return this;
    },
    status(code: number) {
      this._status = code;
      return this;
    },
    json(data: unknown) {
      this._json = data;
      return this;
    },
    end() {
      this._ended = true;
      return this;
    },
  };
  return res as VercelResponse & typeof res;
}

describe('Vercel API Route: /api/iberdrola', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set CORS headers', async () => {
    const handler = await getHandler();
    const req = createMockRequest({ method: 'OPTIONS' });
    const res = createMockResponse();

    await handler(req, res);

    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res._headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(res._headers['Access-Control-Allow-Headers']).toBe('Content-Type');
  });

  it('should handle OPTIONS preflight request', async () => {
    const handler = await getHandler();
    const req = createMockRequest({ method: 'OPTIONS' });
    const res = createMockResponse();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._ended).toBe(true);
  });

  it('should reject non-POST methods', async () => {
    const handler = await getHandler();
    const req = createMockRequest({ method: 'GET' });
    const res = createMockResponse();

    await handler(req, res);

    expect(res._status).toBe(405);
    expect(res._json).toEqual({ error: 'Method not allowed' });
  });

  it('should reject invalid endpoint', async () => {
    const handler = await getHandler();
    const req = createMockRequest({
      body: { endpoint: 'invalid', payload: {} },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._json).toEqual({ error: 'Invalid endpoint. Use "list" or "details"' });
  });

  it('should proxy list endpoint successfully', async () => {
    const handler = await getHandler();
    const mockResponseData = { entidad: [{ cpId: 1 }] };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponseData,
    });

    const req = createMockRequest({
      body: { endpoint: 'list', payload: { dto: { latitudeMax: 39 } } },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual(mockResponseData);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('getListarPuntosRecarga'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('latitudeMax'),
      })
    );
  });

  it('should proxy details endpoint successfully', async () => {
    const handler = await getHandler();
    const mockResponseData = { entidad: [{ cpStatus: { statusCode: 'AVAILABLE' } }] };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponseData,
    });

    const req = createMockRequest({
      body: { endpoint: 'details', payload: { dto: { cuprId: [12345] } } },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual(mockResponseData);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('getDatosPuntoRecarga'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('12345'),
      })
    );
  });

  it('should return upstream error status', async () => {
    const handler = await getHandler();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
    });

    const req = createMockRequest({
      body: { endpoint: 'list', payload: {} },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res._status).toBe(403);
    expect(res._json).toEqual({
      error: 'Iberdrola API error: 403',
      upstream_status: 403,
    });
  });

  it('should handle fetch errors', async () => {
    const handler = await getHandler();

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const req = createMockRequest({
      body: { endpoint: 'list', payload: {} },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res._status).toBe(500);
    expect(res._json).toEqual({ error: 'Network error' });
  });
});

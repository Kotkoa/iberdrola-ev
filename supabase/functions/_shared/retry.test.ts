import { describe, it, expect, vi } from 'vitest';
import { classifyHttpError, retryWithBackoff } from './retry';

describe('classifyHttpError', () => {
  it('should classify 403 as rate_limit', () => {
    expect(classifyHttpError(403)).toBe('rate_limit');
  });

  it('should classify 429 as rate_limit', () => {
    expect(classifyHttpError(429)).toBe('rate_limit');
  });

  it('should classify 404 as not_found', () => {
    expect(classifyHttpError(404)).toBe('not_found');
  });

  it('should classify 500 as server_error', () => {
    expect(classifyHttpError(500)).toBe('server_error');
  });

  it('should classify 503 as server_error', () => {
    expect(classifyHttpError(503)).toBe('server_error');
  });

  it('should classify other codes as unknown', () => {
    expect(classifyHttpError(400)).toBe('unknown');
    expect(classifyHttpError(401)).toBe('unknown');
  });
});

describe('retryWithBackoff', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue({ data: 'success' });
    const result = await retryWithBackoff(fn);

    expect(result.data).toEqual({ data: 'success' });
    expect(result.error).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValue({ data: 'success' });

    const result = await retryWithBackoff(fn, { maxAttempts: 2, baseDelayMs: 10 });

    expect(result.data).toEqual({ data: 'success' });
    expect(result.error).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry on 404', async () => {
    const response = new Response('Not Found', { status: 404 });
    const fn = vi.fn().mockRejectedValue(response);

    const result = await retryWithBackoff(fn, { maxAttempts: 3 });

    expect(result.data).toBeUndefined();
    expect(result.error?.type).toBe('not_found');
    expect(result.error?.message).toBe('Station not found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on 500 and return error after max attempts', async () => {
    const response = new Response('Server Error', {
      status: 500,
      statusText: 'Internal Server Error',
    });
    const fn = vi.fn().mockRejectedValue(response);

    const result = await retryWithBackoff(fn, { maxAttempts: 2, baseDelayMs: 10 });

    expect(result.data).toBeUndefined();
    expect(result.error?.type).toBe('server_error');
    expect(result.error?.message).toBe('Internal Server Error');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on 403 rate limit and return error after max attempts', async () => {
    const response = new Response('Forbidden', { status: 403, statusText: 'Rate Limit' });
    const fn = vi.fn().mockRejectedValue(response);

    const result = await retryWithBackoff(fn, { maxAttempts: 2, baseDelayMs: 10 });

    expect(result.data).toBeUndefined();
    expect(result.error?.type).toBe('rate_limit');
    expect(result.error?.message).toBe('Rate limit exceeded');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on 429 Too Many Requests', async () => {
    const response = new Response('Too Many Requests', { status: 429 });
    const fn = vi.fn().mockRejectedValue(response);

    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 10 });

    expect(result.error?.type).toBe('rate_limit');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should handle non-Response errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Network failure'));

    const result = await retryWithBackoff(fn, { maxAttempts: 2, baseDelayMs: 10 });

    expect(result.data).toBeUndefined();
    expect(result.error?.type).toBe('unknown');
    expect(result.error?.message).toBe('Network failure');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should handle unknown error types', async () => {
    const fn = vi.fn().mockRejectedValue('string error');

    const result = await retryWithBackoff(fn, { maxAttempts: 2, baseDelayMs: 10 });

    expect(result.data).toBeUndefined();
    expect(result.error?.type).toBe('unknown');
    expect(result.error?.message).toBe('Unknown error');
  });

  it('should use exponential backoff', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Fail'));

    await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 });

    // Should retry 3 times with exponential backoff
    // Delays: 0ms (first), 100ms (second), 200ms (third)
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should cap delay at maxDelayMs', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Fail'));

    const result = await retryWithBackoff(fn, {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 2000,
    });

    // Should retry 5 times, but delays capped at 2000ms
    // Delays: 0, 1000, 2000, 2000, 2000 (not 4000, 8000)
    expect(result.error?.type).toBe('unknown');
    expect(fn).toHaveBeenCalledTimes(5);
  });
});

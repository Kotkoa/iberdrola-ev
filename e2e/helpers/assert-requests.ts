import { expect } from '@playwright/test';
import type { CapturedRequest } from './intercept';

/** Filter captured requests by URL substring */
export function getRequestsMatching(captured: CapturedRequest[], pattern: string) {
  return captured.filter((r) => r.url.includes(pattern));
}

/** Assert poll-station was NOT called */
export function assertPollNotCalled(captured: CapturedRequest[]) {
  const calls = getRequestsMatching(captured, 'poll-station');
  expect(calls, 'poll-station should not have been called').toHaveLength(0);
}

/** Assert poll-station WAS called with expected cuprId */
export function assertPollCalledWith(captured: CapturedRequest[], cuprId: number) {
  const calls = getRequestsMatching(captured, 'poll-station');
  expect(calls.length, 'poll-station should have been called').toBeGreaterThan(0);

  const match = calls.some((r) => r.body && (r.body as Record<string, unknown>).cupr_id === cuprId);
  expect(match, `poll-station should have been called with cupr_id=${cuprId}`).toBe(true);
}

/** Assert start-watch payload contains expected fields */
export function assertStartWatchPayload(
  captured: CapturedRequest[],
  expected: { cuprId: number; port: number }
) {
  const calls = getRequestsMatching(captured, 'start-watch');
  expect(calls.length, 'start-watch should have been called').toBeGreaterThan(0);

  const body = calls[0].body as Record<string, unknown>;
  expect(body.cupr_id, 'cupr_id mismatch').toBe(expected.cuprId);
  expect(body.port, 'port mismatch').toBe(expected.port);
  expect(body.subscription, 'subscription should be present').toBeDefined();

  const sub = body.subscription as Record<string, unknown>;
  expect(sub.endpoint, 'subscription.endpoint should be a string').toBeDefined();
  expect(sub.keys, 'subscription.keys should be present').toBeDefined();
}

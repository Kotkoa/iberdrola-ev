import type { Page, Route } from '@playwright/test';
import { createFreshSnapshot, createMetadata } from '../fixtures/station-data';
import { createCheckSubscriptionResponse } from '../fixtures/api-responses';

/** Captured request for assertions */
export interface CapturedRequest {
  url: string;
  method: string;
  body: unknown;
  timestamp: number;
}

/** Configuration for intercepting all Supabase endpoints */
export interface InterceptConfig {
  /** station_snapshots REST response rows */
  snapshots?: unknown[];
  /** station_metadata REST response rows */
  metadata?: unknown[];
  /** poll-station response (object or function for dynamic) */
  pollStation?: unknown | ((body: Record<string, unknown>) => unknown);
  /** start-watch response (object or function for dynamic) */
  startWatch?: unknown | ((body: Record<string, unknown>) => unknown);
  /** check-subscription response */
  checkSubscription?: unknown;
}

/**
 * Sets up deny-by-default request interception for all Supabase endpoints.
 *
 * Playwright matches routes in LIFO order (last registered = first matched).
 * So we register catch-all deny routes FIRST, then specific mocks LAST.
 * This way specific mocks take priority over catch-alls.
 */
export async function interceptAll(page: Page, config: InterceptConfig = {}) {
  const captured: CapturedRequest[] = [];

  function capture(route: Route, body: unknown) {
    captured.push({
      url: route.request().url(),
      method: route.request().method(),
      body,
      timestamp: Date.now(),
    });
  }

  // ── Deny-by-default catch-alls (registered FIRST = lowest priority in LIFO) ──

  await page.route('**/realtime/v1/**', async (route) => {
    capture(route, null);
    await route.abort('connectionrefused');
  });

  await page.route('**/functions/v1/**', async (route) => {
    capture(route, null);
    console.warn(`[intercept] Unmatched Edge Function aborted: ${route.request().url()}`);
    await route.abort('connectionrefused');
  });

  await page.route('**/rest/v1/**', async (route) => {
    capture(route, null);
    console.warn(`[intercept] Unmatched REST request aborted: ${route.request().url()}`);
    await route.abort('connectionrefused');
  });

  // ── Specific mocks (registered LAST = highest priority in LIFO) ──

  // 1. station_snapshots REST
  await page.route('**/rest/v1/station_snapshots**', async (route) => {
    capture(route, null);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(config.snapshots ?? [createFreshSnapshot()]),
    });
  });

  // 2. station_metadata REST
  await page.route('**/rest/v1/station_metadata**', async (route) => {
    capture(route, null);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(config.metadata ?? [createMetadata()]),
    });
  });

  // 3. poll-station Edge Function
  await page.route('**/functions/v1/poll-station', async (route) => {
    const body = route.request().postDataJSON();
    capture(route, body);

    const response =
      typeof config.pollStation === 'function' ? config.pollStation(body) : config.pollStation;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        response ?? {
          ok: false,
          error: { code: 'TEST_UNEXPECTED', message: 'poll-station called unexpectedly' },
        }
      ),
    });
  });

  // 4. start-watch Edge Function
  await page.route('**/functions/v1/start-watch', async (route) => {
    const body = route.request().postDataJSON();
    capture(route, body);

    const response =
      typeof config.startWatch === 'function' ? config.startWatch(body) : config.startWatch;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        response ?? {
          ok: true,
          data: {
            subscription_id: 'mock-sub',
            task_id: 'mock-task',
            current_status: {
              port1_status: 'BUSY',
              port2_status: 'BUSY',
              observed_at: new Date().toISOString(),
            },
            fresh: true,
            next_poll_in: null,
          },
        }
      ),
    });
  });

  // 5. check-subscription Edge Function
  await page.route('**/functions/v1/check-subscription**', async (route) => {
    const body = route.request().postDataJSON();
    capture(route, body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(config.checkSubscription ?? createCheckSubscriptionResponse()),
    });
  });

  return captured;
}

import { test, expect } from '@playwright/test';
import { interceptAll } from '../helpers/intercept';
import { seedPrimaryStation, mockPushApi } from '../helpers/setup-station';
import { assertStartWatchPayload, getRequestsMatching } from '../helpers/assert-requests';
import { createFreshSnapshot, createMetadata } from '../fixtures/station-data';
import {
  createStartWatchSuccess,
  createCheckSubscriptionResponse,
} from '../fixtures/api-responses';
import { TEST_STATION } from '../fixtures/constants';

test.describe('Subscription contract', () => {
  // ─── Subscribe: click "Get notified" → start-watch called correctly ───

  test('subscribe — sends correct start-watch payload', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await mockPushApi(context);
    await seedPrimaryStation(context);

    // Both ports BUSY so "Get notified" buttons appear
    const snapshot = createFreshSnapshot({
      port1Status: 'BUSY',
      port2Status: 'BUSY',
      overallStatus: 'BUSY',
    });

    const captured = await interceptAll(page, {
      snapshots: [snapshot],
      metadata: [createMetadata()],
      checkSubscription: createCheckSubscriptionResponse([]),
      startWatch: createStartWatchSuccess(),
    });

    await page.goto('/');

    // Wait for station to load
    await expect(page.getByTestId('station-availability')).toContainText('All ports are busy', {
      timeout: 10_000,
    });

    // Click "Get notified" on port 1
    const subscribeButton = page.getByTestId('subscribe-button-1');
    await expect(subscribeButton).toBeVisible();
    await subscribeButton.click();

    // Wait for start-watch to be called
    await expect(async () => {
      const calls = getRequestsMatching(captured, 'start-watch');
      expect(calls.length).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });

    // Verify start-watch payload
    assertStartWatchPayload(captured, {
      cuprId: TEST_STATION.cuprId,
      port: 1,
    });

    // Button changes to "Cancel alert"
    await expect(subscribeButton).toContainText('Cancel alert');

    // Success promo appears
    await expect(page.getByTestId('subscription-promo')).toBeVisible();
  });

  // ─── Restore: check-subscription returns ports → "Cancel alert" on load ───

  test('restore — shows Cancel alert on load for subscribed port', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await mockPushApi(context);
    await seedPrimaryStation(context);

    const snapshot = createFreshSnapshot({
      port1Status: 'BUSY',
      port2Status: 'BUSY',
      overallStatus: 'BUSY',
    });

    await interceptAll(page, {
      snapshots: [snapshot],
      metadata: [createMetadata()],
      checkSubscription: createCheckSubscriptionResponse([1]),
    });

    await page.goto('/');

    // Wait for station to load
    await expect(page.getByTestId('station-availability')).toContainText('All ports are busy', {
      timeout: 10_000,
    });

    // Port 1 subscribe button shows "Cancel alert" (restored from check-subscription)
    await expect(page.getByTestId('subscribe-button-1')).toContainText('Cancel alert', {
      timeout: 10_000,
    });

    // Port 2 still shows "Get notified" (not subscribed)
    await expect(page.getByTestId('subscribe-button-2')).toContainText('Get notified');

    // Promo alert visible for port 1
    await expect(page.getByTestId('subscription-promo')).toBeVisible();
  });

  // ─── Push received: SW postMessage resets "Cancel alert" → "Get notified" ───

  test('push received — resets Cancel alert back to Get notified', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await mockPushApi(context);
    await seedPrimaryStation(context);

    // Both ports BUSY so subscribe buttons appear
    const snapshot = createFreshSnapshot({
      port1Status: 'BUSY',
      port2Status: 'BUSY',
      overallStatus: 'BUSY',
    });

    const captured = await interceptAll(page, {
      snapshots: [snapshot],
      metadata: [createMetadata()],
      checkSubscription: createCheckSubscriptionResponse([]),
      startWatch: createStartWatchSuccess(),
    });

    await page.goto('/');

    // Wait for station to load
    await expect(page.getByTestId('station-availability')).toContainText('All ports are busy', {
      timeout: 10_000,
    });

    // Click "Get notified" on port 1
    const port1Button = page.getByTestId('subscribe-button-1');
    const port2Button = page.getByTestId('subscribe-button-2');
    await expect(port1Button).toBeVisible();
    await port1Button.click();

    // Wait for start-watch to be called and button to show "Cancel alert"
    await expect(async () => {
      const calls = getRequestsMatching(captured, 'start-watch');
      expect(calls.length).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });
    await expect(port1Button).toContainText('Cancel alert');

    // Simulate SW postMessage for port 1 (as the Service Worker would after push notification)
    await page.evaluate((stationId: string) => {
      const event = new MessageEvent('message', {
        data: { type: 'PUSH_RECEIVED', stationId, portNumber: 1 },
      });
      navigator.serviceWorker.dispatchEvent(event);
    }, String(TEST_STATION.cpId));

    // Port 1 resets from "Cancel alert" → "Get notified"
    await expect(port1Button).toContainText('Get notified', { timeout: 5_000 });

    // Port 2 remains unaffected — still "Get notified"
    await expect(port2Button).toContainText('Get notified');
  });
});

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

    // Button changes to "Alert active"
    await expect(subscribeButton).toContainText('Alert active');

    // Success promo appears
    await expect(page.getByTestId('subscription-promo')).toBeVisible();
  });

  // ─── Restore: check-subscription returns ports → "Alert active" on load ───

  test('restore — shows Alert active on load for subscribed port', async ({ page, context }) => {
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

    // Port 1 subscribe button shows "Alert active" (restored from check-subscription)
    await expect(page.getByTestId('subscribe-button-1')).toContainText('Alert active', {
      timeout: 10_000,
    });

    // Port 2 still shows "Get notified" (not subscribed)
    await expect(page.getByTestId('subscribe-button-2')).toContainText('Get notified');

    // Promo alert visible for port 1
    await expect(page.getByTestId('subscription-promo')).toBeVisible();
  });
});

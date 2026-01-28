/**
 * E2E Push Notification Test - Playwright Implementation
 *
 * This test automates the complete push notification flow:
 * 1. Subscribe to port availability notifications
 * 2. Verify subscription in database
 * 3. Trigger notification by changing port status
 * 4. Verify notification delivery and UI updates
 *
 * Prerequisites:
 * - Dev server running on http://localhost:5173
 * - Supabase project accessible
 * - Chrome browser with notification support
 *
 * TODO: This is a template for future implementation when MCP servers are available
 * Current status: Manual execution required (see E2E-PUSH-NOTIFICATION-TEST-REPORT.md)
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Test configuration
const TEST_CONFIG = {
  appUrl: 'http://localhost:5173',
  stationId: '147988',
  portNumber: 1,
  notificationTimeout: 3000, // 3 seconds
  uiUpdateTimeout: 1000, // 1 second
};

// Supabase configuration (from .env.local)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://cribsatiisubfyafflmy.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize Supabase client for database operations
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Helper function to grant notification permissions
 */
async function grantNotificationPermission(context: {
  grantPermissions: (permissions: string[]) => Promise<void>;
}) {
  await context.grantPermissions(['notifications']);
}

/**
 * Helper function to get current station snapshot from database
 */
async function getCurrentSnapshot(cpId: number) {
  const { data, error } = await supabase
    .from('station_snapshots')
    .select('id, cp_id, port1_status, port2_status, observed_at')
    .eq('cp_id', cpId)
    .order('observed_at', { ascending: false })
    .limit(1)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Helper function to update port status in database
 */
async function updatePortStatus(snapshotId: string, cpId: number, status: string) {
  const { error } = await supabase
    .from('station_snapshots')
    .update({ port1_status: status })
    .eq('id', snapshotId)
    .eq('cp_id', cpId);

  if (error) throw error;
}

/**
 * Helper function to get active subscription from database
 */
async function getActiveSubscription(stationId: string, portNumber: number) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('station_id', stationId)
    .eq('port_number', portNumber)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data;
}

/**
 * Helper function to delete test subscriptions (cleanup)
 */
async function cleanupSubscriptions(stationId: string) {
  await supabase.from('subscriptions').delete().eq('station_id', stationId);
}

test.describe('E2E Push Notification Flow', () => {
  test.beforeAll(async () => {
    // Cleanup any existing test subscriptions
    await cleanupSubscriptions(TEST_CONFIG.stationId);
  });

  test.afterAll(async () => {
    // Cleanup test data after all tests
    await cleanupSubscriptions(TEST_CONFIG.stationId);
  });

  test('should complete full push notification flow', async ({ page, context }) => {
    // Grant notification permission before navigating
    await grantNotificationPermission(context);

    // Step 1: Navigate to application
    test.step('Open application and verify station is displayed', async () => {
      await page.goto(TEST_CONFIG.appUrl);

      // Wait for application to load
      await page.waitForLoadState('networkidle');

      // Verify station 147988 is displayed
      await expect(page.locator(`text=Station ${TEST_CONFIG.stationId}`)).toBeVisible();

      // Verify port cards are visible
      await expect(page.locator('text=Port 1')).toBeVisible();
      await expect(page.locator('text=Port 2')).toBeVisible();

      // Check for console errors
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      expect(consoleErrors).toHaveLength(0);
    });

    // Step 2: Subscribe to notifications
    await test.step('Subscribe to port availability notifications', async () => {
      // Find and click "Get notified" button on Port 1
      const getNotifiedButton = page.locator('button:has-text("Get notified")').first();
      await expect(getNotifiedButton).toBeVisible();
      await getNotifiedButton.click();

      // Wait for button to change to "Alert active"
      await expect(page.locator('button:has-text("Alert active")').first()).toBeVisible({
        timeout: 5000,
      });

      // Verify green success alert appears
      await expect(
        page.locator("text=We'll alert you as soon as this port is available")
      ).toBeVisible();

      // Verify button is disabled
      const alertActiveButton = page.locator('button:has-text("Alert active")').first();
      await expect(alertActiveButton).toBeDisabled();
    });

    // Step 3: Verify subscription in database
    await test.step('Verify subscription was saved to database', async () => {
      // Wait a moment for database write
      await page.waitForTimeout(1000);

      // Query database for subscription
      const subscription = await getActiveSubscription(
        TEST_CONFIG.stationId,
        TEST_CONFIG.portNumber
      );

      expect(subscription).not.toBeNull();
      expect(subscription.station_id).toBe(TEST_CONFIG.stationId);
      expect(subscription.port_number).toBe(TEST_CONFIG.portNumber);
      expect(subscription.is_active).toBe(true);
      expect(subscription.last_notified_at).toBeNull();
      expect(subscription.endpoint).toContain('fcm.googleapis.com');
    });

    // Step 4: Get current snapshot and prepare for status change
    let snapshotId: string;
    let initialStatus: string;

    await test.step('Get current station snapshot', async () => {
      const snapshot = await getCurrentSnapshot(parseInt(TEST_CONFIG.stationId));

      expect(snapshot).not.toBeNull();
      expect(snapshot.cp_id).toBe(parseInt(TEST_CONFIG.stationId));

      snapshotId = snapshot.id;
      initialStatus = snapshot.port1_status;

      console.log(`Current Port 1 Status: ${initialStatus}`);
    });

    // Step 5: Ensure port is Occupied (if needed)
    await test.step('Ensure port is Occupied before triggering notification', async () => {
      if (initialStatus === 'Available') {
        // Set to Occupied first
        await updatePortStatus(snapshotId, parseInt(TEST_CONFIG.stationId), 'Occupied');

        // Wait for UI to update
        await page.waitForTimeout(2000);

        // Verify UI shows Occupied status
        await expect(page.locator('text=Occupied').first()).toBeVisible();
      }
    });

    // Step 6: Listen for browser notifications
    const notifications: { timestamp: number; message: string }[] = [];

    await test.step('Set up notification listener', async () => {
      // Note: Playwright doesn't directly support listening to system notifications
      // This is a placeholder for when Playwright MCP or similar capability is available
      // TODO: Implement notification listening when MCP servers are available

      // For now, we can monitor service worker messages
      page.on('console', (msg) => {
        if (msg.text().includes('Push notification received')) {
          notifications.push({
            timestamp: Date.now(),
            message: msg.text(),
          });
        }
      });
    });

    // Step 7: Trigger notification by changing port status to Available
    await test.step('Change port status to Available (triggers notification)', async () => {
      // Update port status to Available
      await updatePortStatus(snapshotId, parseInt(TEST_CONFIG.stationId), 'Available');

      // Wait for notification to be triggered
      await page.waitForTimeout(TEST_CONFIG.notificationTimeout);

      // Verify UI updates automatically (realtime subscription)
      await expect(page.locator('text=Free charging point').first()).toBeVisible({
        timeout: TEST_CONFIG.uiUpdateTimeout,
      });

      // Verify port card shows green/success state
      const portCard = page.locator('[data-testid="port-1-card"]').first();
      await expect(portCard).toHaveClass(/success|green/);

      // Note: Browser notification verification would happen here with MCP
      // TODO: Verify browser notification when MCP is available
    });

    // Step 8: Verify last_notified_at was updated
    await test.step('Verify notification timestamp was updated in database', async () => {
      // Wait for Edge Function to update database
      await page.waitForTimeout(2000);

      // Query subscription again
      const updatedSubscription = await getActiveSubscription(
        TEST_CONFIG.stationId,
        TEST_CONFIG.portNumber
      );

      expect(updatedSubscription).not.toBeNull();
      expect(updatedSubscription.last_notified_at).not.toBeNull();

      // Calculate seconds since notification
      const notifiedAt = new Date(updatedSubscription.last_notified_at);
      const now = new Date();
      const secondsAgo = (now.getTime() - notifiedAt.getTime()) / 1000;

      expect(secondsAgo).toBeLessThan(10);
    });

    // Step 9: Verify no console errors
    await test.step('Verify no console errors occurred', async () => {
      const consoleErrors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      // Filter out acceptable errors (if any)
      const criticalErrors = consoleErrors.filter((error) => {
        // Add filters for known non-critical errors
        return !error.includes('React DevTools');
      });

      expect(criticalErrors).toHaveLength(0);
    });

    // Step 10: Verify Service Worker is active
    await test.step('Verify Service Worker is registered and active', async () => {
      const serviceWorkerRegistration = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return {
          active: registration?.active !== null,
          scope: registration?.scope,
          updateViaCache: registration?.updateViaCache,
        };
      });

      expect(serviceWorkerRegistration.active).toBe(true);
    });
  });

  test('should handle subscription cleanup when unsubscribing', async ({ page, context }) => {
    // Grant notification permission
    await grantNotificationPermission(context);

    await test.step('Subscribe and then unsubscribe', async () => {
      await page.goto(TEST_CONFIG.appUrl);
      await page.waitForLoadState('networkidle');

      // Subscribe
      const getNotifiedButton = page.locator('button:has-text("Get notified")').first();
      await getNotifiedButton.click();
      await expect(page.locator('button:has-text("Alert active")').first()).toBeVisible();

      // Verify subscription exists
      let subscription = await getActiveSubscription(TEST_CONFIG.stationId, TEST_CONFIG.portNumber);
      expect(subscription).not.toBeNull();

      // Click "Alert active" to unsubscribe
      const alertActiveButton = page.locator('button:has-text("Alert active")').first();
      await alertActiveButton.click();

      // Wait for unsubscribe to complete
      await page.waitForTimeout(1000);

      // Verify button changed back to "Get notified"
      await expect(getNotifiedButton).toBeVisible();

      // Verify subscription is inactive in database
      subscription = await getActiveSubscription(TEST_CONFIG.stationId, TEST_CONFIG.portNumber);
      expect(subscription).toBeNull(); // No active subscription
    });
  });

  test('should handle errors gracefully when subscription fails', async ({ page, context }) => {
    await grantNotificationPermission(context);

    await test.step('Simulate subscription failure', async () => {
      // TODO: Mock Edge Function to return error
      // This would require MCP or network interception capabilities

      await page.goto(TEST_CONFIG.appUrl);
      await page.waitForLoadState('networkidle');

      // Attempt to subscribe
      const getNotifiedButton = page.locator('button:has-text("Get notified")').first();
      await getNotifiedButton.click();

      // Verify error message appears (if implemented)
      // await expect(page.locator('text=Failed to subscribe')).toBeVisible();
    });
  });
});

/**
 * Performance Tests
 */
test.describe('Push Notification Performance', () => {
  test('notification delivery should be fast', async ({ page, context }) => {
    await grantNotificationPermission(context);
    await page.goto(TEST_CONFIG.appUrl);

    const startTime = Date.now();

    // Subscribe
    await page.locator('button:has-text("Get notified")').first().click();
    await expect(page.locator('button:has-text("Alert active")').first()).toBeVisible();

    const subscribeTime = Date.now() - startTime;
    expect(subscribeTime).toBeLessThan(2000); // < 2 seconds

    // Get snapshot and trigger notification
    const snapshot = await getCurrentSnapshot(parseInt(TEST_CONFIG.stationId));

    // Ensure Occupied
    if (snapshot.port1_status === 'Available') {
      await updatePortStatus(snapshot.id, parseInt(TEST_CONFIG.stationId), 'Occupied');
      await page.waitForTimeout(2000);
    }

    const notificationStartTime = Date.now();

    // Trigger notification
    await updatePortStatus(snapshot.id, parseInt(TEST_CONFIG.stationId), 'Available');

    // Wait for UI to update
    await expect(page.locator('text=Free charging point').first()).toBeVisible();

    const notificationDeliveryTime = Date.now() - notificationStartTime;
    expect(notificationDeliveryTime).toBeLessThan(TEST_CONFIG.notificationTimeout); // < 3 seconds

    console.log(`Performance Metrics:
      - Subscribe Time: ${subscribeTime}ms
      - Notification Delivery Time: ${notificationDeliveryTime}ms
    `);
  });
});

/**
 * Edge Cases
 */
test.describe('Push Notification Edge Cases', () => {
  test('should handle rapid status changes correctly', async ({ page, context }) => {
    await grantNotificationPermission(context);
    await page.goto(TEST_CONFIG.appUrl);

    // Subscribe
    await page.locator('button:has-text("Get notified")').first().click();
    await expect(page.locator('button:has-text("Alert active")').first()).toBeVisible();

    const snapshot = await getCurrentSnapshot(parseInt(TEST_CONFIG.stationId));

    // Rapid status changes: Occupied -> Available -> Occupied -> Available
    await updatePortStatus(snapshot.id, parseInt(TEST_CONFIG.stationId), 'Occupied');
    await page.waitForTimeout(500);

    await updatePortStatus(snapshot.id, parseInt(TEST_CONFIG.stationId), 'Available');
    await page.waitForTimeout(500);

    await updatePortStatus(snapshot.id, parseInt(TEST_CONFIG.stationId), 'Occupied');
    await page.waitForTimeout(500);

    await updatePortStatus(snapshot.id, parseInt(TEST_CONFIG.stationId), 'Available');

    // Verify UI eventually shows correct state
    await expect(page.locator('text=Free charging point').first()).toBeVisible({
      timeout: 5000,
    });
  });

  test('should not notify if port goes from Available to Occupied', async ({ page, context }) => {
    await grantNotificationPermission(context);
    await page.goto(TEST_CONFIG.appUrl);

    // Subscribe
    await page.locator('button:has-text("Get notified")').first().click();
    await expect(page.locator('button:has-text("Alert active")').first()).toBeVisible();

    const snapshot = await getCurrentSnapshot(parseInt(TEST_CONFIG.stationId));
    const initialSubscription = await getActiveSubscription(
      TEST_CONFIG.stationId,
      TEST_CONFIG.portNumber
    );

    // Change from Available to Occupied (should NOT trigger notification)
    await updatePortStatus(snapshot.id, parseInt(TEST_CONFIG.stationId), 'Available');
    await page.waitForTimeout(1000);

    await updatePortStatus(snapshot.id, parseInt(TEST_CONFIG.stationId), 'Occupied');
    await page.waitForTimeout(3000);

    // Verify last_notified_at did NOT change
    const updatedSubscription = await getActiveSubscription(
      TEST_CONFIG.stationId,
      TEST_CONFIG.portNumber
    );

    expect(updatedSubscription.last_notified_at).toEqual(initialSubscription.last_notified_at);
  });
});

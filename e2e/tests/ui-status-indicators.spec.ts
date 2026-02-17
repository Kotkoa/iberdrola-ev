import { test, expect } from '@playwright/test';
import { interceptAll } from '../helpers/intercept';
import { seedPrimaryStation } from '../helpers/setup-station';
import { createFreshSnapshot, createMetadata } from '../fixtures/station-data';
import { TEST_STATION } from '../fixtures/constants';

test.describe('UI status indicators', () => {
  // ─── Chips: Iberdrola + ID.{cpId} ───

  test('shows Iberdrola chip and station ID chip', async ({ page, context }) => {
    await seedPrimaryStation(context);

    await interceptAll(page, {
      snapshots: [createFreshSnapshot()],
      metadata: [createMetadata()],
    });

    await page.goto('/');

    await expect(page.getByText('Iberdrola')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('station-id-chip')).toContainText(`ID.${TEST_STATION.cpId}`);
  });

  // ─── Emergency stop alert ───

  test('shows emergency stop alert when pressed', async ({ page, context }) => {
    await seedPrimaryStation(context);

    await interceptAll(page, {
      snapshots: [createFreshSnapshot({ emergencyStopPressed: true })],
      metadata: [createMetadata()],
    });

    await page.goto('/');

    const alert = page.getByTestId('emergency-alert');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText('Emergency stop activated');
  });

  // ─── Maintenance alert ───

  test('shows maintenance alert for MAINT situation code', async ({ page, context }) => {
    await seedPrimaryStation(context);

    await interceptAll(page, {
      snapshots: [createFreshSnapshot({ situationCode: 'MAINT' })],
      metadata: [createMetadata()],
    });

    await page.goto('/');

    const alert = page.getByTestId('maintenance-alert');
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText('Maintenance');
  });

  // ─── Connection indicator: realtime blocked → Offline/Connecting ───

  test('shows disconnected connection indicator when realtime is blocked', async ({
    page,
    context,
  }) => {
    await seedPrimaryStation(context);

    await interceptAll(page, {
      snapshots: [createFreshSnapshot()],
      metadata: [createMetadata()],
    });

    await page.goto('/');

    // Wait for station to load first
    await expect(page.getByTestId('station-availability')).toBeVisible({ timeout: 10_000 });

    // Connection indicator shows non-connected state (Offline, Connecting, or Reconnecting)
    const indicator = page.getByTestId('connection-indicator');
    await expect(indicator).toBeVisible();
    // Since realtime is blocked, it should NOT show "Live"
    await expect(indicator).not.toContainText('Live');
  });
});

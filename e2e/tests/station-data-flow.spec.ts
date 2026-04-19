import { test, expect } from '@playwright/test';
import { interceptAll } from '../helpers/intercept';
import { seedPrimaryStation } from '../helpers/setup-station';
import { assertPollCalledWith } from '../helpers/assert-requests';
import { createFreshSnapshot, createStaleSnapshot, createMetadata } from '../fixtures/station-data';
import {
  createPollSuccess,
  createPollRateLimited,
  createPollError,
} from '../fixtures/api-responses';
import { TEST_STATION } from '../fixtures/constants';

test.describe('Station data flow', () => {
  // ─── A. Fresh cache: UI from snapshot, poll-station fires in background ───

  test('fresh cache — shows data immediately and polls in background', async ({
    page,
    context,
  }) => {
    await seedPrimaryStation(context);

    const snapshot = createFreshSnapshot({
      port1Status: 'AVAILABLE',
      port2Status: 'BUSY',
    });

    const captured = await interceptAll(page, {
      snapshots: [snapshot],
      metadata: [createMetadata()],
      pollStation: createPollSuccess({
        port1Status: 'AVAILABLE',
        port2Status: 'BUSY',
        overallStatus: 'AVAILABLE',
      }),
    });

    await page.goto('/');

    // UI shows availability from snapshot
    await expect(page.getByTestId('station-availability')).toContainText('Available: 1 of 2');

    // Port cards rendered
    await expect(page.getByTestId('port-card-1')).toBeVisible();
    await expect(page.getByTestId('port-card-2')).toBeVisible();

    // Background poll fired with correct cuprId
    await expect.poll(() => captured.some((req) => req.url.includes('poll-station'))).toBe(true);
    assertPollCalledWith(captured, TEST_STATION.cuprId);
  });

  test('fresh cache — both ports available, polls in background', async ({ page, context }) => {
    await seedPrimaryStation(context);

    const snapshot = createFreshSnapshot({
      port1Status: 'AVAILABLE',
      port2Status: 'AVAILABLE',
      overallStatus: 'AVAILABLE',
    });

    const captured = await interceptAll(page, {
      snapshots: [snapshot],
      metadata: [createMetadata()],
      pollStation: createPollSuccess({
        port1Status: 'AVAILABLE',
        port2Status: 'AVAILABLE',
        overallStatus: 'AVAILABLE',
      }),
    });

    await page.goto('/');

    await expect(page.getByTestId('station-availability')).toContainText('Available: 2 of 2');
    await expect.poll(() => captured.some((req) => req.url.includes('poll-station'))).toBe(true);
    assertPollCalledWith(captured, TEST_STATION.cuprId);
  });

  test('fresh cache — both ports busy, polls in background', async ({ page, context }) => {
    await seedPrimaryStation(context);

    const snapshot = createFreshSnapshot({
      port1Status: 'BUSY',
      port2Status: 'BUSY',
      overallStatus: 'BUSY',
    });

    const captured = await interceptAll(page, {
      snapshots: [snapshot],
      metadata: [createMetadata()],
      pollStation: createPollSuccess({
        port1Status: 'BUSY',
        port2Status: 'BUSY',
        overallStatus: 'BUSY',
      }),
    });

    await page.goto('/');

    await expect(page.getByTestId('station-availability')).toContainText('All ports are busy');
    await expect.poll(() => captured.some((req) => req.url.includes('poll-station'))).toBe(true);
    assertPollCalledWith(captured, TEST_STATION.cuprId);
  });

  // ─── B. Stale cache: poll-station called, UI updates ───

  test('stale cache — calls poll-station and shows fresh data', async ({ page, context }) => {
    await seedPrimaryStation(context);

    const staleSnapshot = createStaleSnapshot({
      port1Status: 'BUSY',
      port2Status: 'BUSY',
    });

    const pollResponse = createPollSuccess({
      port1Status: 'AVAILABLE',
      port2Status: 'BUSY',
    });

    const captured = await interceptAll(page, {
      snapshots: [staleSnapshot],
      metadata: [createMetadata()],
      pollStation: pollResponse,
    });

    await page.goto('/');

    // Wait for UI to update with fresh data from poll-station
    await expect(page.getByTestId('station-availability')).toContainText('Available: 1 of 2', {
      timeout: 10_000,
    });

    // poll-station was called with correct cuprId
    assertPollCalledWith(captured, TEST_STATION.cuprId);
  });

  // ─── C. Stale + RATE_LIMITED: fallback to cache ───

  test('stale + rate limited — falls back to stale cache', async ({ page, context }) => {
    await seedPrimaryStation(context);

    const staleSnapshot = createStaleSnapshot({
      port1Status: 'BUSY',
      port2Status: 'BUSY',
    });

    const captured = await interceptAll(page, {
      snapshots: [staleSnapshot],
      metadata: [createMetadata()],
      pollStation: createPollRateLimited(300),
    });

    await page.goto('/');

    // Falls back to stale data
    await expect(page.getByTestId('station-availability')).toContainText('All ports are busy', {
      timeout: 10_000,
    });

    // poll-station WAS called (but got rate limited)
    assertPollCalledWith(captured, TEST_STATION.cuprId);
  });

  // ─── D. No snapshot + poll success: UI recovers ───

  test('no snapshot + poll success — recovers via poll-station', async ({ page, context }) => {
    await seedPrimaryStation(context);

    const pollResponse = createPollSuccess({
      port1Status: 'AVAILABLE',
      port2Status: 'AVAILABLE',
      overallStatus: 'AVAILABLE',
    });

    const captured = await interceptAll(page, {
      snapshots: [], // No cached snapshot
      metadata: [createMetadata()],
      pollStation: pollResponse,
    });

    await page.goto('/');

    // UI shows data from poll-station
    await expect(page.getByTestId('station-availability')).toContainText('Available: 2 of 2', {
      timeout: 10_000,
    });

    assertPollCalledWith(captured, TEST_STATION.cuprId);
  });

  // ─── E. No snapshot + poll error: error state ───

  test('no snapshot + poll error — shows error state', async ({ page, context }) => {
    await seedPrimaryStation(context);

    const captured = await interceptAll(page, {
      snapshots: [], // No cached snapshot
      metadata: [createMetadata()],
      pollStation: createPollError('UPSTREAM_ERROR', 'Iberdrola API unavailable'),
    });

    await page.goto('/');

    // Should show an error message (the exact text comes from the error response)
    await expect(page.getByText(/Iberdrola API unavailable|error/i)).toBeVisible({
      timeout: 10_000,
    });

    assertPollCalledWith(captured, TEST_STATION.cuprId);
  });
});

#!/usr/bin/env tsx

/**
 * Manual test script for push notification trigger
 *
 * Usage:
 *   yarn tsx scripts/test-push-notification.ts
 *
 * This script:
 * 1. Checks active subscriptions for station 147988
 * 2. Gets current port status
 * 3. Simulates status change (Occupied → Available)
 * 4. Waits for notification delivery
 * 5. Verifies last_notified_at timestamp updated
 *
 * Prerequisites:
 * - Active subscription in database
 * - Browser tab open with notification permission granted
 * - VAPID keys configured in Supabase
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const TEST_STATION_ID = '147988';
const TEST_PORT = 1;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function main() {
  console.log('🔔 Push Notification Test\n');
  console.log(`📍 Testing station: ${TEST_STATION_ID}, port: ${TEST_PORT}\n`);

  // Step 1: Check active subscriptions
  console.log('1️⃣ Checking active subscriptions...');
  const { data: subscriptions, error: subError } = await supabase
    .from('subscriptions')
    .select('id, station_id, port_number, endpoint, created_at')
    .eq('station_id', TEST_STATION_ID)
    .eq('port_number', TEST_PORT)
    .eq('is_active', true);

  if (subError) {
    console.error('❌ Error fetching subscriptions:', subError);
    return;
  }

  if (!subscriptions || subscriptions.length === 0) {
    console.log('⚠️  No active subscriptions found for this station/port');
    console.log(
      '\n💡 To create a subscription:\n   1. Open http://localhost:5173\n   2. Click "Get notified" button\n   3. Allow notifications\n'
    );
    return;
  }

  console.log(`✅ Found ${subscriptions.length} active subscription(s):`);
  subscriptions.forEach((sub, i) => {
    console.log(`   ${i + 1}. ${sub.endpoint.substring(0, 60)}... (created: ${sub.created_at})`);
  });

  // Step 2: Get current snapshot
  console.log('\n2️⃣ Getting current port status...');
  const { data: snapshots, error: snapError } = await supabase
    .from('station_snapshots')
    .select('id, cp_id, port1_status, port2_status, observed_at')
    .eq('cp_id', parseInt(TEST_STATION_ID))
    .order('observed_at', { ascending: false })
    .limit(1);

  if (snapError || !snapshots || snapshots.length === 0) {
    console.error('❌ Error fetching snapshot:', snapError);
    return;
  }

  const currentSnapshot = snapshots[0];
  const currentStatus =
    TEST_PORT === 1 ? currentSnapshot.port1_status : currentSnapshot.port2_status;

  console.log(`   Current status: ${currentStatus}`);
  console.log(`   Snapshot ID: ${currentSnapshot.id}`);
  console.log(`   Observed at: ${currentSnapshot.observed_at}`);

  // Step 3: Simulate status change
  console.log('\n3️⃣ Simulating status change (Occupied → Available)...');

  if (currentStatus === 'Available') {
    console.log('⚠️  Port is already Available. Setting to Occupied first...');

    // First set to Occupied
    const { error: updateError1 } = await supabase
      .from('station_snapshots')
      .update({
        port1_status: TEST_PORT === 1 ? 'Occupied' : currentSnapshot.port1_status,
        port2_status: TEST_PORT === 2 ? 'Occupied' : currentSnapshot.port2_status,
      })
      .eq('id', currentSnapshot.id);

    if (updateError1) {
      console.error('❌ Error updating snapshot to Occupied:', updateError1);
      return;
    }

    console.log('✅ Set to Occupied');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Now set to Available (this should trigger notification)
  console.log('   Updating status to Available...');
  const { error: updateError2 } = await supabase
    .from('station_snapshots')
    .update({
      port1_status: TEST_PORT === 1 ? 'Available' : currentSnapshot.port1_status,
      port2_status: TEST_PORT === 2 ? 'Available' : currentSnapshot.port2_status,
    })
    .eq('id', currentSnapshot.id);

  if (updateError2) {
    console.error('❌ Error updating snapshot to Available:', updateError2);
    return;
  }

  console.log('✅ Status changed to Available');

  // Step 4: Wait for notification delivery
  console.log('\n4️⃣ Waiting for notification delivery...');
  console.log('   (Check your browser for popup notification)');

  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Step 5: Verify last_notified_at updated
  console.log('\n5️⃣ Verifying notification was sent...');
  const { data: updatedSubs, error: verifyError } = await supabase
    .from('subscriptions')
    .select('id, last_notified_at')
    .eq('station_id', TEST_STATION_ID)
    .eq('port_number', TEST_PORT)
    .eq('is_active', true)
    .not('last_notified_at', 'is', null)
    .order('last_notified_at', { ascending: false })
    .limit(1);

  if (verifyError) {
    console.error('❌ Error verifying notification:', verifyError);
    return;
  }

  if (!updatedSubs || updatedSubs.length === 0) {
    console.log('⚠️  last_notified_at not updated - notification may not have been sent');
    console.log(
      "\n🔍 Troubleshooting:\n   1. Check VAPID keys in Supabase Edge Functions Secrets\n   2. Check browser console for errors\n   3. Check Supabase Edge Functions logs\n   4. Verify trigger is enabled: SELECT * FROM pg_trigger WHERE tgname = 'trigger_port_available'\n"
    );
    return;
  }

  const notifiedAt = new Date(updatedSubs[0].last_notified_at);
  const now = new Date();
  const secondsAgo = Math.floor((now.getTime() - notifiedAt.getTime()) / 1000);

  console.log(`✅ Notification sent successfully!`);
  console.log(`   last_notified_at: ${updatedSubs[0].last_notified_at}`);
  console.log(`   (${secondsAgo} seconds ago)`);

  console.log('\n🎉 Test completed successfully!');
  console.log(
    "\n💡 If you didn't see a browser notification:\n   - Check notification permissions in browser\n   - Ensure browser tab is open\n   - Check service worker is registered (DevTools > Application > Service Workers)\n"
  );
}

main().catch(console.error);

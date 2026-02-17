import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEDUP_WINDOW_MS = 5 * 60 * 1000;

interface SendPushRequest {
  stationId: string;
  portNumber: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { stationId, portNumber }: SendPushRequest = await req.json();

    // Step 1: fetch ALL active subscriptions (no dedup filter)
    const { data: allActive, error } = await supabaseAdmin
      .from('subscriptions')
      .select('id, endpoint, p256dh, auth, last_notified_at')
      .eq('station_id', stationId)
      .eq('port_number', portNumber)
      .eq('is_active', true);

    if (error) {
      console.error('Failed to fetch subscriptions:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Case A: no active subscriptions at all
    if (!allActive || allActive.length === 0) {
      return new Response(JSON.stringify({ status: 'no_subscriptions' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: filter for dedup — only subscriptions outside the 5-minute cooldown
    const fiveMinAgo = new Date(Date.now() - DEDUP_WINDOW_MS);
    const readyToNotify = allActive.filter(
      (sub) => !sub.last_notified_at || new Date(sub.last_notified_at) < fiveMinAgo
    );

    // Case B: subscriptions exist but all are in cooldown
    if (readyToNotify.length === 0) {
      const now = Date.now();
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          Math.min(
            ...allActive.map((sub) => {
              const notifiedAt = new Date(sub.last_notified_at!).getTime();
              return notifiedAt + DEDUP_WINDOW_MS - now;
            })
          ) / 1000
        )
      );
      return new Response(
        JSON.stringify({ status: 'cooldown', retry_after_seconds: retryAfterSeconds }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Case C: send notifications
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com';

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    // Fetch station metadata for human-readable notification
    const { data: meta } = await supabaseAdmin
      .from('station_metadata')
      .select('address_street, address_town')
      .eq('cp_id', Number(stationId))
      .maybeSingle();

    const location = meta
      ? [meta.address_street, meta.address_town].filter(Boolean).join(', ')
      : `station ${stationId}`;

    const payload = JSON.stringify({
      title: 'Charger Available!',
      body: `Port ${portNumber} at ${location} is now available`,
      url: `/?station=${stationId}`,
      stationId,
      portNumber,
    });

    const pushResults = await Promise.allSettled(
      readyToNotify.map(async (sub) => {
        return webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
      })
    );

    // Count successful/failed deliveries
    const successCount = pushResults.filter((r) => r.status === 'fulfilled').length;
    const failedCount = pushResults.filter((r) => r.status === 'rejected').length;

    // Deactivate ONLY the subscriptions we actually sent to (by ID)
    const notifiedIds = readyToNotify.map((s) => s.id);
    await supabaseAdmin
      .from('subscriptions')
      .update({
        last_notified_at: new Date().toISOString(),
        is_active: false,
      })
      .in('id', notifiedIds);

    console.log(
      `Notifications sent for station ${stationId} port ${portNumber}: success=${successCount}, failed=${failedCount}, deactivated=${notifiedIds.length}`
    );

    return new Response(
      JSON.stringify({
        status: 'sent',
        sent: successCount,
        failed: failedCount,
        deactivated: notifiedIds.length,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Send push notification error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

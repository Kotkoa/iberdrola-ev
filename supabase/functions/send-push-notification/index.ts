import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Get all active subscriptions for this station and port
    const { data: subscriptions, error } = await supabaseAdmin
      .from('subscriptions')
      .select('id, endpoint, p256dh, auth')
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

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: 'No active subscriptions for this port' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Send push notification to each subscriber
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@example.com';

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const payload = JSON.stringify({
      title: 'Charger Available!',
      body: `Port ${portNumber} at station ${stationId} is now available`,
      url: `/?station=${stationId}`,
    });

    const pushResults = await Promise.allSettled(
      subscriptions.map(async (sub) => {
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

    // Deactivate ALL subscriptions after sending (one-time notification model)
    await supabaseAdmin
      .from('subscriptions')
      .update({
        last_notified_at: new Date().toISOString(),
        is_active: false,
      })
      .eq('station_id', stationId)
      .eq('port_number', portNumber)
      .eq('is_active', true);

    console.log(
      `Notifications sent for station ${stationId} port ${portNumber}: success=${successCount}, failed=${failedCount}, subscriptions deactivated`
    );

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failedCount,
        deactivated: subscriptions.length,
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

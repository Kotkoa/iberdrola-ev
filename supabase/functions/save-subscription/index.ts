import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SaveSubscriptionRequest {
  stationId: string;
  portNumber?: number;
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
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

    const { stationId, portNumber, subscription }: SaveSubscriptionRequest = await req.json();

    // Validation
    if (!stationId || !subscription?.endpoint || !subscription?.keys) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: stationId, subscription' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const port = portNumber ?? 1;
    const { endpoint, keys } = subscription;

    // Check if subscription already exists
    const { data: existing } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('station_id', stationId)
      .eq('port_number', port)
      .eq('endpoint', endpoint)
      .maybeSingle();

    let error;

    if (existing) {
      // Update existing subscription
      const result = await supabaseAdmin
        .from('subscriptions')
        .update({
          p256dh: keys.p256dh,
          auth: keys.auth,
          is_active: true,
        })
        .eq('id', existing.id);
      error = result.error;
    } else {
      // Insert new subscription
      const result = await supabaseAdmin.from('subscriptions').insert({
        station_id: stationId,
        port_number: port,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        is_active: true,
      });
      error = result.error;
    }

    if (error) {
      console.error('Subscription save error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, status: 'subscribed' }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Save subscription error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

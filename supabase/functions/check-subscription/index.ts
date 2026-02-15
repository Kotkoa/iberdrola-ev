import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckSubscriptionRequest {
  stationId: string;
  endpoint: string;
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

    const { stationId, endpoint }: CheckSubscriptionRequest = await req.json();

    if (!stationId || !endpoint) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: stationId, endpoint' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Get active subscriptions for this endpoint and station
    const { data: subs, error } = await supabaseAdmin
      .from('subscriptions')
      .select('port_number')
      .eq('station_id', stationId)
      .eq('endpoint', endpoint)
      .eq('is_active', true);

    if (error) {
      console.error('Check subscription error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Return array of ports the user is subscribed to
    const subscribedPorts = subs?.map((s) => s.port_number) ?? [];

    return new Response(JSON.stringify({ subscribedPorts }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Check subscription error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

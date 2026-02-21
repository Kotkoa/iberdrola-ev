import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StopWatchRequest {
  station_id: string;
  port_number: number | null;
  endpoint: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { station_id, port_number, endpoint }: StopWatchRequest = await req.json();

    if (!station_id || !endpoint) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'station_id and endpoint are required' },
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find matching active subscription
    let query = supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('station_id', station_id)
      .eq('endpoint', endpoint)
      .eq('is_active', true);

    if (port_number != null) {
      query = query.eq('port_number', port_number);
    }

    const { data: subs, error: findError } = await query;

    if (findError) {
      console.error('Stop watch find error:', findError);
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: findError.message },
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, data: { deactivated: 0, tasks_expired: 0 } }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const subIds = subs.map((s: { id: string }) => s.id);

    // Deactivate subscriptions
    await supabaseAdmin.from('subscriptions').update({ is_active: false }).in('id', subIds);

    // Expire related polling tasks
    const { data: expiredTasks } = await supabaseAdmin
      .from('polling_tasks')
      .update({ status: 'expired' })
      .in('subscription_id', subIds)
      .in('status', ['pending', 'running'])
      .select('id');

    console.log(
      `Stop watch: deactivated ${subIds.length} subscription(s), expired ${expiredTasks?.length ?? 0} task(s) for station ${station_id} port ${port_number}`
    );

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          deactivated: subIds.length,
          tasks_expired: expiredTasks?.length ?? 0,
        },
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Stop watch error:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

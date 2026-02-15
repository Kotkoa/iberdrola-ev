import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WatchRequest {
  cupr_id: number;
  port?: number;
  target_status?: string;
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
    const body: WatchRequest = await req.json();
    const { cupr_id, port, target_status = 'Available', subscription } = body;

    if (!cupr_id) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'MISSING_CUPR_ID', message: 'cupr_id is required' },
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'MISSING_SUBSCRIPTION', message: 'Valid subscription object is required' },
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check rate limit via can_poll_station RPC
    const { data: pollCheck, error: pollCheckError } = await supabaseAdmin.rpc('can_poll_station', {
      p_cupr_id: cupr_id,
    });

    if (pollCheckError) {
      console.error('can_poll_station error:', pollCheckError);
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'RPC_ERROR', message: pollCheckError.message },
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const canPoll = pollCheck?.[0]?.can_poll ?? true;
    const secondsUntilNext = pollCheck?.[0]?.seconds_until_next ?? 0;

    let currentStatus: Record<string, unknown> | null = null;
    let fresh = false;

    if (canPoll) {
      // Call poll-station Edge Function
      const pollUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/poll-station`;
      const pollRes = await fetch(pollUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ cupr_id }),
      });

      const pollData = await pollRes.json();
      if (pollData.ok) {
        currentStatus = pollData.data;
        fresh = true;
      }
    }

    // If not fresh, get cached data
    if (!fresh) {
      const { data: stationData, error: stationError } = await supabaseAdmin.rpc(
        'get_station_with_snapshot',
        { p_cupr_id: cupr_id }
      );

      if (!stationError && stationData?.[0]) {
        const s = stationData[0];
        currentStatus = {
          cp_id: s.cp_id,
          port1_status: s.port1_status,
          port2_status: s.port2_status,
          overall_status: s.overall_status,
          observed_at: s.observed_at,
        };
      }
    }

    // Get station metadata to find cp_id
    const { data: metadata, error: metaError } = await supabaseAdmin
      .from('station_metadata')
      .select('cp_id')
      .eq('cupr_id', cupr_id)
      .single();

    if (metaError || !metadata) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'STATION_NOT_FOUND', message: 'Station not found' },
        }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Save subscription (check existing, then insert or update)
    const stationId = String(metadata.cp_id);
    const portNumber = port ?? null;

    // Deactivate ALL existing active subscriptions for this endpoint (one-active-per-browser model)
    await supabaseAdmin
      .from('subscriptions')
      .update({ is_active: false })
      .eq('endpoint', subscription.endpoint)
      .eq('is_active', true);

    // Check if subscription already exists for this exact station + port + endpoint
    let existingQuery = supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('station_id', stationId)
      .eq('endpoint', subscription.endpoint);

    if (portNumber !== null) {
      existingQuery = existingQuery.eq('port_number', portNumber);
    } else {
      existingQuery = existingQuery.is('port_number', null);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    let subData: { id: string } | null = null;
    let subError: { message: string } | null = null;

    if (existing) {
      // Update existing subscription
      const result = await supabaseAdmin
        .from('subscriptions')
        .update({
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          is_active: true,
          target_status: target_status,
        })
        .eq('id', existing.id)
        .select('id')
        .single();
      subData = result.data;
      subError = result.error;
    } else {
      // Insert new subscription
      const result = await supabaseAdmin
        .from('subscriptions')
        .insert({
          station_id: stationId,
          port_number: portNumber,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          is_active: true,
          target_status: target_status,
        })
        .select('id')
        .single();
      subData = result.data;
      subError = result.error;
    }

    if (subError || !subData) {
      console.error('Subscription save error:', subError);
      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'SUBSCRIPTION_ERROR',
            message: subError?.message ?? 'Failed to save subscription',
          },
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Create polling task
    const { data: taskId, error: taskError } = await supabaseAdmin.rpc('create_polling_task', {
      p_subscription_id: subData.id,
      p_target_port: port ?? null,
      p_target_status: target_status,
    });

    if (taskError) {
      console.error('Create polling task error:', taskError);
      // Don't fail the request, subscription is already saved
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          subscription_id: subData.id,
          task_id: taskId ?? null,
          current_status: currentStatus,
          fresh,
          next_poll_in: fresh ? 300 : secondsUntilNext,
        },
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Start watch error:', error);
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

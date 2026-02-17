import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReadyTask {
  task_id: string;
  subscription_id: string;
  station_id: string;
  cp_id: number;
  target_port: number;
  consecutive_available: number;
}

interface ProcessResult {
  processed: number;
  expired: number;
  ready: ReadyTask[];
  dry_run: boolean;
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

    // Process polling tasks (not dry run — mark ready tasks as dispatching)
    const { data, error } = await supabaseAdmin.rpc('process_polling_tasks', {
      p_dry_run: false,
    });

    if (error) {
      console.error('[process-polling] RPC error:', error);
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'RPC_ERROR', message: error.message } }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const result = data as ProcessResult;
    console.log(
      `[process-polling] processed=${result.processed} expired=${result.expired} ready=${result.ready.length}`
    );

    // Dispatch push notifications for ready tasks
    let dispatched = 0;
    let failed = 0;

    for (const task of result.ready) {
      try {
        const pushUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`;
        const pushRes = await fetch(pushUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            stationId: task.station_id,
            portNumber: task.target_port,
          }),
        });

        const pushData = await pushRes.json();
        // Backwards-compatible: old format uses { success: true }, new uses { status: "sent" }
        const pushStatus = pushData.status ?? (pushData.success ? 'sent' : undefined);

        if (pushRes.ok && pushStatus === 'sent') {
          // Notifications were actually sent
          await supabaseAdmin
            .from('polling_tasks')
            .update({ status: 'completed' })
            .eq('id', task.task_id);
          dispatched++;
          console.log(
            `[process-polling] Dispatched notification for task=${task.task_id} station=${task.station_id} port=${task.target_port} sent=${pushData.sent ?? 'unknown'}`
          );
        } else if (pushRes.ok && pushStatus === 'cooldown') {
          // Active subscriptions exist but in dedup cooldown — retry next cycle
          await supabaseAdmin
            .from('polling_tasks')
            .update({ status: 'running' })
            .eq('id', task.task_id);
          console.log(
            `[process-polling] Cooldown for task=${task.task_id} station=${task.station_id} port=${task.target_port}, retry_after=${pushData.retry_after_seconds}s`
          );
        } else if (pushRes.ok && pushStatus === 'no_subscriptions') {
          // No active subscriptions at all — mark completed
          await supabaseAdmin
            .from('polling_tasks')
            .update({ status: 'completed' })
            .eq('id', task.task_id);
          dispatched++;
          console.log(
            `[process-polling] No subscriptions for task=${task.task_id} station=${task.station_id} port=${task.target_port}, marking completed`
          );
        } else {
          // Non-200 or unknown status — revert to running for retry
          console.error(
            `[process-polling] Push failed for task=${task.task_id}: status=${pushRes.status} body=${JSON.stringify(pushData)}`
          );
          await supabaseAdmin
            .from('polling_tasks')
            .update({ status: 'running' })
            .eq('id', task.task_id);
          failed++;
        }
      } catch (pushError) {
        console.error(`[process-polling] Push error for task=${task.task_id}:`, pushError);
        await supabaseAdmin
          .from('polling_tasks')
          .update({ status: 'running' })
          .eq('id', task.task_id);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          processed: result.processed,
          expired: result.expired,
          ready: result.ready.length,
          dispatched,
          failed,
        },
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[process-polling] Error:', error);
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

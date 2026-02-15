import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type VerificationMode = 'enqueue' | 'run' | 'complete' | 'reconcile';

interface EnqueuePayload {
  mode: 'enqueue';
  items: Array<{ cp_id: number; cupr_id: number }>;
}

interface RunPayload {
  mode: 'run';
  batch_size?: number;
}

interface CompletePayload {
  mode: 'complete';
  items?: Array<{
    cp_id: number;
    is_free?: boolean | null;
    verified_at?: string | null;
    error?: string | null;
  }>;
}

interface ReconcilePayload {
  mode: 'reconcile';
}

type VerificationRequest = EnqueuePayload | RunPayload | CompletePayload | ReconcilePayload;

interface ClaimedItem {
  cp_id: number;
  cupr_id: number;
  attempt_count: number;
}

function getBackoffSeconds(attempt: number): number {
  if (attempt <= 1) return 120;
  if (attempt === 2) return 300;
  if (attempt === 3) return 900;
  if (attempt === 4) return 1800;
  return 3600;
}

async function triggerScraperWorkflow(cuprId: number): Promise<{ ok: boolean; error?: string }> {
  const GITHUB_PAT = Deno.env.get('GITHUB_PAT');
  const GITHUB_OWNER = Deno.env.get('GITHUB_OWNER');
  const GITHUB_REPO = Deno.env.get('GITHUB_REPO');

  if (!GITHUB_PAT || !GITHUB_OWNER || !GITHUB_REPO) {
    return { ok: false, error: 'GitHub secrets not configured' };
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/scraper.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${GITHUB_PAT}`,
          'User-Agent': 'Supabase-Edge-Function',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { cupr_id: String(cuprId) },
        }),
      }
    );

    if (response.status === 204) {
      return { ok: true };
    }

    const text = await response.text();
    return { ok: false, error: `GitHub dispatch failed: ${response.status} ${text}` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown GitHub dispatch error',
    };
  }
}

function parseMode(raw: unknown): VerificationMode | null {
  if (raw === 'enqueue' || raw === 'run' || raw === 'complete' || raw === 'reconcile') {
    return raw;
  }
  return null;
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

    const body = (await req.json()) as VerificationRequest;
    const mode = parseMode((body as { mode?: unknown }).mode);

    if (!mode) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'mode is required' },
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (mode === 'enqueue') {
      const payload = body as EnqueuePayload;
      if (!Array.isArray(payload.items)) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: { code: 'VALIDATION_ERROR', message: 'items[] is required for enqueue' },
          }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const { data, error } = await supabaseAdmin.rpc('enqueue_verification_candidates', {
        p_items: payload.items,
      });

      if (error) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: { code: 'RPC_ERROR', message: error.message },
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          data: { enqueued: data ?? 0, requested: payload.items.length },
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (mode === 'run') {
      const payload = body as RunPayload;
      const batchSize = Math.max(1, Math.min(5, Number(payload.batch_size ?? 1)));

      await supabaseAdmin.rpc('mark_processing_timeout', { p_timeout_minutes: 20 });

      const { data: claimed, error: claimError } = await supabaseAdmin.rpc(
        'claim_verification_batch',
        {
          p_limit: batchSize,
        }
      );

      if (claimError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: { code: 'RPC_ERROR', message: claimError.message },
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const items = (claimed || []) as ClaimedItem[];
      let dispatched = 0;
      const dispatchFailures: Array<{ cp_id: number; reason: string }> = [];

      for (const item of items) {
        const dispatch = await triggerScraperWorkflow(item.cupr_id);
        if (dispatch.ok) {
          dispatched += 1;
          continue;
        }

        dispatchFailures.push({
          cp_id: item.cp_id,
          reason: dispatch.error ?? 'dispatch failed',
        });

        const nextAttempt = (item.attempt_count ?? 0) + 1;

        if (nextAttempt >= 2) {
          await Promise.all([
            supabaseAdmin
              .from('station_metadata')
              .update({ verification_state: 'dead_letter' })
              .eq('cp_id', item.cp_id)
              .not('verification_state', 'in', '(verified_free,verified_paid)'),
            supabaseAdmin.from('station_verification_queue').delete().eq('cp_id', item.cp_id),
          ]);
          continue;
        }

        const retryAt = new Date(Date.now() + getBackoffSeconds(nextAttempt) * 1000).toISOString();
        await Promise.all([
          supabaseAdmin
            .from('station_metadata')
            .update({ verification_state: 'failed' })
            .eq('cp_id', item.cp_id)
            .not('verification_state', 'in', '(verified_free,verified_paid)'),
          supabaseAdmin
            .from('station_verification_queue')
            .update({
              status: 'pending',
              attempt_count: nextAttempt,
              next_attempt_at: retryAt,
              locked_at: null,
              last_error: dispatch.error ?? 'dispatch failed',
              updated_at: new Date().toISOString(),
            })
            .eq('cp_id', item.cp_id),
        ]);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            claimed: items.length,
            dispatched,
            dispatch_failures: dispatchFailures,
          },
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (mode === 'complete') {
      const payload = body as CompletePayload;
      const updates = payload.items ?? [];
      let updated = 0;

      for (const item of updates) {
        if (!item.cp_id) continue;

        if (item.error) {
          await supabaseAdmin
            .from('station_metadata')
            .update({ verification_state: 'failed' })
            .eq('cp_id', item.cp_id)
            .not('verification_state', 'in', '(verified_free,verified_paid)');
          continue;
        }

        if (typeof item.is_free === 'boolean') {
          await Promise.all([
            supabaseAdmin
              .from('station_metadata')
              .update({
                verification_state: item.is_free ? 'verified_free' : 'verified_paid',
                price_verified: true,
                price_verified_at: item.verified_at ?? new Date().toISOString(),
              })
              .eq('cp_id', item.cp_id),
            supabaseAdmin.from('station_verification_queue').delete().eq('cp_id', item.cp_id),
          ]);
          updated += 1;
        }
      }

      const { data: reconcileData, error: reconcileError } = await supabaseAdmin.rpc(
        'reconcile_verification_queue',
        {
          p_max_retries: 2,
          p_timeout_minutes: 20,
        }
      );

      if (reconcileError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: { code: 'RPC_ERROR', message: reconcileError.message },
          }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            completed_from_payload: updated,
            reconcile: reconcileData,
          },
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const { data: reconcileData, error: reconcileError } = await supabaseAdmin.rpc(
      'reconcile_verification_queue',
      {
        p_max_retries: 2,
        p_timeout_minutes: 20,
      }
    );

    if (reconcileError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'RPC_ERROR', message: reconcileError.message },
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          reconcile: reconcileData,
        },
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
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

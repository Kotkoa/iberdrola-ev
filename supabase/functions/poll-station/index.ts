import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PollRequest {
  cupr_id: number;
}

interface SnapshotRow {
  cp_id: number;
  port1_status: string | null;
  port2_status: string | null;
  port1_update_date: string | null;
  port2_update_date: string | null;
  overall_status: string | null;
  created_at: string;
}

interface MetadataRow {
  cp_id: number;
  cupr_id: number;
}

/**
 * Trigger GitHub Action to run scraper for a specific station.
 * Fire-and-forget: does not block response.
 */
async function triggerGitHubAction(cuprId: number): Promise<boolean> {
  const GITHUB_PAT = Deno.env.get('GITHUB_PAT');
  const GITHUB_OWNER = Deno.env.get('GITHUB_OWNER');
  const GITHUB_REPO = Deno.env.get('GITHUB_REPO');

  if (!GITHUB_PAT || !GITHUB_OWNER || !GITHUB_REPO) {
    console.warn('[poll-station] GitHub secrets not configured, skipping dispatch');
    return false;
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
      console.log(`[poll-station] GitHub Action triggered for cupr_id=${cuprId}`);
      return true;
    } else {
      const text = await response.text();
      console.error(`[poll-station] GitHub dispatch failed: ${response.status} ${text}`);
      return false;
    }
  } catch (error) {
    console.error('[poll-station] GitHub dispatch error:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { cupr_id }: PollRequest = await req.json();

    if (!cupr_id) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'cupr_id is required' },
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Get cp_id from cupr_id
    const { data: metadata, error: metaError } = await supabaseAdmin
      .from('station_metadata')
      .select('cp_id, cupr_id')
      .eq('cupr_id', cupr_id)
      .limit(1)
      .single();

    if (metaError || !metadata) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'NOT_FOUND', message: `Station with cupr_id=${cupr_id} not found` },
        }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const cpId = (metadata as MetadataRow).cp_id;

    // 2. Get latest snapshot from cache
    const { data: snapshot } = await supabaseAdmin
      .from('station_snapshots')
      .select(
        'cp_id, port1_status, port2_status, port1_update_date, port2_update_date, overall_status, created_at'
      )
      .eq('cp_id', cpId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // 3. Check if we can trigger scraper (rate limit: 5 min)
    const { data: throttle } = await supabaseAdmin
      .from('snapshot_throttle')
      .select('last_snapshot_at')
      .eq('cp_id', cpId)
      .single();

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const lastPollAt = throttle?.last_snapshot_at ? new Date(throttle.last_snapshot_at) : null;
    const canTrigger = !lastPollAt || lastPollAt < fiveMinutesAgo;

    let scraperTriggered = false;
    let retryAfter: number | null = null;

    if (canTrigger) {
      // 4. Trigger GitHub Action (fire-and-forget)
      scraperTriggered = await triggerGitHubAction(cupr_id);

      if (scraperTriggered) {
        // 5. Update throttle to prevent rapid re-triggers
        await supabaseAdmin.from('snapshot_throttle').upsert(
          {
            cp_id: cpId,
            last_snapshot_at: new Date().toISOString(),
          },
          { onConflict: 'cp_id' }
        );
      }
    } else if (lastPollAt) {
      // Calculate seconds until next poll allowed
      retryAfter = Math.ceil((lastPollAt.getTime() + 5 * 60 * 1000 - Date.now()) / 1000);
    }

    // 6. Return cached data (always)
    if (snapshot) {
      const row = snapshot as SnapshotRow;
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            cp_id: row.cp_id,
            port1_status: row.port1_status,
            port2_status: row.port2_status,
            port1_update_date: row.port1_update_date,
            port2_update_date: row.port2_update_date,
            overall_status: row.overall_status,
            observed_at: row.created_at,
          },
          meta: {
            fresh: false, // Always from cache in this architecture
            scraper_triggered: scraperTriggered,
            retry_after: retryAfter,
          },
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    } else {
      // No cached data available
      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'No cached data available for this station',
          },
          meta: {
            scraper_triggered: scraperTriggered,
          },
        }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[poll-station] Error:', error);
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

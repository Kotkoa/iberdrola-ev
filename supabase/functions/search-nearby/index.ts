import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  latitude: number;
  longitude: number;
  radiusKm: number;
}

interface StationResult {
  cpId: number;
  cuprId: number;
  name: string;
  latitude: number;
  longitude: number;
  addressFull: string;
  overallStatus: string | null;
  totalPorts: number | null;
  maxPower: number | null;
  freePorts: number | null;
  priceKwh: number | null;
  socketType: string | null;
  distanceKm: number;
  verificationState: string;
}

/**
 * Trigger GitHub Action geo-search.yml to search stations in bounding box.
 * Fire-and-forget: does not block response.
 */
async function triggerGitHubGeoSearch(
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number
): Promise<boolean> {
  const GITHUB_PAT = Deno.env.get('GITHUB_PAT');
  const GITHUB_OWNER = Deno.env.get('GITHUB_OWNER');
  const GITHUB_REPO = Deno.env.get('GITHUB_REPO');

  if (!GITHUB_PAT || !GITHUB_OWNER || !GITHUB_REPO) {
    console.warn('[search-nearby] GitHub secrets not configured, skipping dispatch');
    return false;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/geo-search.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${GITHUB_PAT}`,
          'User-Agent': 'Supabase-Edge-Function',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            lat_min: String(latMin),
            lat_max: String(latMax),
            lon_min: String(lonMin),
            lon_max: String(lonMax),
          },
        }),
      }
    );

    if (response.status === 204) {
      console.log(
        `[search-nearby] GitHub Action triggered for bbox: ${latMin},${lonMin} - ${latMax},${lonMax}`
      );
      return true;
    } else {
      const text = await response.text();
      console.error(`[search-nearby] GitHub dispatch failed: ${response.status} ${text}`);
      return false;
    }
  } catch (error) {
    console.error('[search-nearby] GitHub dispatch error:', error);
    return false;
  }
}

/**
 * Convert radius to bounding box
 */
function radiusToBbox(
  lat: number,
  lon: number,
  radiusKm: number
): { latMin: number; latMax: number; lonMin: number; lonMax: number } {
  const KM_PER_DEGREE_LAT = 111;
  const DEG_TO_RAD = Math.PI / 180;

  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const lonDelta = radiusKm / (KM_PER_DEGREE_LAT * Math.cos(lat * DEG_TO_RAD));

  return {
    latMin: lat - latDelta,
    latMax: lat + latDelta,
    lonMin: lon - lonDelta,
    lonMax: lon + lonDelta,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { latitude, longitude, radiusKm }: SearchRequest = await req.json();

    if (!latitude || !longitude || !radiusKm) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'latitude, longitude, radiusKm are required',
          },
        }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const bbox = radiusToBbox(latitude, longitude, radiusKm);

    // 1. Get stations from cache using RPC
    const { data: stations, error: searchError } = await supabaseAdmin.rpc(
      'search_stations_nearby',
      {
        p_lat: latitude,
        p_lon: longitude,
        p_radius_km: radiusKm,
        p_only_free: false,
      }
    );

    if (searchError) {
      console.error('[search-nearby] RPC error:', searchError);
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'RPC_ERROR', message: searchError.message },
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Keep only stations explicitly verified as FREE in station_metadata
    const rows = (stations || []) as Record<string, unknown>[];
    const cpIds = rows.map((s) => s.cp_id).filter((id): id is number => typeof id === 'number');

    const verificationMap = new Map<number, string>();
    if (cpIds.length > 0) {
      const { data: verificationRows, error: verificationError } = await supabaseAdmin
        .from('station_metadata')
        .select('cp_id, verification_state')
        .in('cp_id', cpIds);

      if (verificationError) {
        console.warn(
          '[search-nearby] verification state lookup failed:',
          verificationError.message
        );
      } else {
        for (const row of verificationRows || []) {
          verificationMap.set(
            row.cp_id as number,
            (row.verification_state as string) || 'unprocessed'
          );
        }
      }
    }

    const verifiedRows = rows.filter((s) => {
      const cpId = s.cp_id as number;
      return verificationMap.get(cpId) === 'verified_free';
    });

    // 3. Enqueue nearby unverified stations for verification (single batched RPC)
    let verificationEnqueued = 0;
    const { data: candidates, error: candidatesError } = await supabaseAdmin
      .from('station_metadata')
      .select('cp_id, cupr_id, verification_state')
      .gte('latitude', bbox.latMin)
      .lte('latitude', bbox.latMax)
      .gte('longitude', bbox.lonMin)
      .lte('longitude', bbox.lonMax)
      .limit(300);

    if (candidatesError) {
      console.warn('[search-nearby] candidate lookup failed:', candidatesError.message);
    } else {
      const enqueueItems = (candidates || [])
        .filter(
          (c) =>
            typeof c.cp_id === 'number' &&
            typeof c.cupr_id === 'number' &&
            c.verification_state !== 'verified_free' &&
            c.verification_state !== 'verified_paid'
        )
        .map((c) => ({ cp_id: c.cp_id as number, cupr_id: c.cupr_id as number }));

      if (enqueueItems.length > 0) {
        const { data: enqueued, error: enqueueError } = await supabaseAdmin.rpc(
          'enqueue_verification_candidates',
          { p_items: enqueueItems }
        );
        if (enqueueError) {
          console.warn('[search-nearby] enqueue failed:', enqueueError.message);
        } else {
          verificationEnqueued = Number(enqueued ?? 0);
        }
      }
    }

    // 4. Check if we should trigger GitHub Action (rate limit: 5 min per bbox)

    // Use a hash of bbox as throttle key
    const bboxKey = `geo_${Math.round(bbox.latMin * 100)}_${Math.round(bbox.lonMin * 100)}_${Math.round(bbox.latMax * 100)}_${Math.round(bbox.lonMax * 100)}`;

    const { data: throttle } = await supabaseAdmin
      .from('geo_search_throttle')
      .select('last_search_at')
      .eq('bbox_key', bboxKey)
      .single();

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const lastSearchAt = throttle?.last_search_at ? new Date(throttle.last_search_at) : null;
    const canTrigger = !lastSearchAt || lastSearchAt < fiveMinutesAgo;

    let scraperTriggered = false;
    let retryAfter: number | null = null;

    if (canTrigger) {
      // 3. Trigger GitHub Action (fire-and-forget)
      scraperTriggered = await triggerGitHubGeoSearch(
        bbox.latMin,
        bbox.latMax,
        bbox.lonMin,
        bbox.lonMax
      );

      if (scraperTriggered) {
        // 4. Update throttle
        await supabaseAdmin.from('geo_search_throttle').upsert(
          {
            bbox_key: bboxKey,
            last_search_at: new Date().toISOString(),
          },
          { onConflict: 'bbox_key' }
        );
      }
    } else if (lastSearchAt) {
      retryAfter = Math.ceil((lastSearchAt.getTime() + 5 * 60 * 1000 - Date.now()) / 1000);
    }

    // 5. Transform results to frontend format
    const results: StationResult[] = verifiedRows.map((s: Record<string, unknown>) => ({
      cpId: s.cp_id as number,
      cuprId: s.cupr_id as number,
      name: (s.name as string) || 'Unknown',
      latitude: s.lat as number,
      longitude: s.lon as number,
      addressFull: (s.address as string) || 'Address unknown',
      overallStatus: s.overall_status as string | null,
      totalPorts: s.total_ports as number | null,
      maxPower: s.max_power as number | null,
      freePorts: s.free_ports as number | null,
      priceKwh: s.price_kwh as number | null,
      socketType: s.socket_type as string | null,
      distanceKm: s.distance_km as number,
      verificationState: 'verified_free',
    }));

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          stations: results,
          count: results.length,
        },
        meta: {
          fresh: false, // Always from cache
          scraper_triggered: scraperTriggered,
          retry_after: retryAfter,
          verification_enqueued: verificationEnqueued,
        },
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[search-nearby] Error:', error);
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

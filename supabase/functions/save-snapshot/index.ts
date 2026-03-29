import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SnapshotRequest {
  cpId: number;
  cuprId: number;
  source: 'user_nearby' | 'user_station';
  stationData: {
    cpName?: string;
    latitude?: number;
    longitude?: number;
    addressFull?: string;
    port1Status?: string;
    port1PowerKw?: number;
    port1PriceKwh?: number;
    port1UpdateDate?: string;
    port1SocketType?: string;
    port2Status?: string;
    port2PowerKw?: number;
    port2PriceKwh?: number;
    port2UpdateDate?: string;
    port2SocketType?: string;
    overallStatus?: string;
    emergencyStopPressed?: boolean;
    situationCode?: string;
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

    const { cpId, cuprId, source, stationData }: SnapshotRequest = await req.json();

    if (!cpId || !source || !stationData) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: cpId, source, stationData' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const snapshotData = {
      port1_status: stationData.port1Status || null,
      port1_power_kw: stationData.port1PowerKw || null,
      port1_price_kwh: stationData.port1PriceKwh ?? 0,
      port1_update_date: stationData.port1UpdateDate || null,
      port2_status: stationData.port2Status || null,
      port2_power_kw: stationData.port2PowerKw || null,
      port2_price_kwh: stationData.port2PriceKwh ?? 0,
      port2_update_date: stationData.port2UpdateDate || null,
      overall_status: stationData.overallStatus || null,
      emergency_stop_pressed: stationData.emergencyStopPressed || false,
      situation_code: stationData.situationCode || null,
    };

    await supabaseAdmin.from('station_metadata').upsert(
      {
        cp_id: cpId,
        cupr_id: cuprId,
        latitude: stationData.latitude,
        longitude: stationData.longitude,
        address_full: stationData.addressFull,
      },
      { onConflict: 'cp_id' }
    );

    const { data: existing } = await supabaseAdmin
      .from('station_snapshots')
      .select('observed_at')
      .eq('cp_id', cpId)
      .single();

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const shouldStore = !existing?.observed_at || new Date(existing.observed_at) < fiveMinutesAgo;

    let stored = false;

    if (shouldStore) {
      await supabaseAdmin.from('station_snapshots').upsert(
        {
          cp_id: cpId,
          source,
          observed_at: new Date().toISOString(),
          ...snapshotData,
        },
        { onConflict: 'cp_id' }
      );

      stored = true;
    }

    return new Response(JSON.stringify({ success: true, stored }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Save snapshot error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

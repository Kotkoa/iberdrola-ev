import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IBERDROLA_BASE_URL = 'https://www.iberdrola.es/o/webclipb/iberdrola/puntosrecargacontroller';
const DETAILS_URL = `${IBERDROLA_BASE_URL}/getDatosPuntoRecarga`;

interface DetailsRequest {
  cuprId: number;
  cpId: number;
}

interface PhysicalSocket {
  status?: { statusCode?: string; updateDate?: string };
  appliedRate?: { recharge?: { finalPrice?: number } };
  maxPower?: number;
  socketType?: { socketName?: string; socketTypeId?: string };
}

interface StationDetails {
  cpStatus?: { statusCode?: string };
  logicalSocket?: { physicalSocket?: PhysicalSocket[] }[];
  emergencyStopButtonPressed?: boolean;
  locationData?: {
    cuprName?: string;
    latitude?: number;
    longitude?: number;
    situationCode?: string;
    cuprReservationIndicator?: boolean;
    supplyPointData?: {
      cpAddress?: {
        streetName?: string;
        streetNum?: string;
        townName?: string;
        regionName?: string;
      };
    };
  };
}

function extractSnapshotData(details: StationDetails) {
  const logical = details.logicalSocket || [];
  const flattened = logical.flatMap((ls) => ls.physicalSocket || []);
  const port1 = flattened[0];
  const port2 = flattened[1];

  return {
    port1_status: port1?.status?.statusCode || null,
    port1_power_kw: port1?.maxPower || null,
    port1_price_kwh: port1?.appliedRate?.recharge?.finalPrice ?? 0,
    port1_update_date: port1?.status?.updateDate || null,
    port1_socket_type: port1?.socketType?.socketName || null,
    port2_status: port2?.status?.statusCode || null,
    port2_power_kw: port2?.maxPower || null,
    port2_price_kwh: port2?.appliedRate?.recharge?.finalPrice ?? 0,
    port2_update_date: port2?.status?.updateDate || null,
    port2_socket_type: port2?.socketType?.socketName || null,
    overall_status: details.cpStatus?.statusCode || null,
    emergency_stop_pressed: details.emergencyStopButtonPressed || false,
    situation_code: details.locationData?.situationCode || null,
  };
}

function formatAddress(details: StationDetails): string | null {
  const addr = details.locationData?.supplyPointData?.cpAddress;
  if (!addr) return null;
  return `${addr.streetName || ''} ${addr.streetNum || ''}, ${addr.townName || ''}, ${addr.regionName || ''}`.trim();
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

    const { cuprId, cpId }: DetailsRequest = await req.json();

    if (!cuprId || !cpId) {
      return new Response(JSON.stringify({ error: 'Missing required fields: cuprId, cpId' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(DETAILS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ dto: { cuprId: [cuprId] }, language: 'en' }),
    });

    if (!response.ok) {
      throw new Error(`Iberdrola API error: ${response.status}`);
    }

    const data = await response.json();
    const details: StationDetails = data.entidad?.[0];

    if (!details) {
      return new Response(JSON.stringify({ error: 'Station not found' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const snapshotData = extractSnapshotData(details);
    const addressFull = formatAddress(details);

    await supabaseAdmin.from('station_metadata').upsert(
      {
        cp_id: cpId,
        cupr_id: cuprId,
        latitude: details.locationData?.latitude,
        longitude: details.locationData?.longitude,
        address_full: addressFull,
      },
      { onConflict: 'cp_id' }
    );

    const { data: hashResult } = await supabaseAdmin.rpc('compute_snapshot_hash', {
      p1_status: snapshotData.port1_status,
      p1_power: snapshotData.port1_power_kw,
      p1_price: snapshotData.port1_price_kwh,
      p2_status: snapshotData.port2_status,
      p2_power: snapshotData.port2_power_kw,
      p2_price: snapshotData.port2_price_kwh,
      overall: snapshotData.overall_status,
      emergency: snapshotData.emergency_stop_pressed,
      situation: snapshotData.situation_code,
    });

    const payloadHash = hashResult as string;

    const { data: shouldStore } = await supabaseAdmin.rpc('should_store_snapshot', {
      p_cp_id: cpId,
      p_hash: payloadHash,
      p_minutes: 5,
    });

    if (shouldStore) {
      await supabaseAdmin.from('station_snapshots').insert({
        cp_id: cpId,
        source: 'user_station',
        payload_hash: payloadHash,
        ...snapshotData,
      });

      await supabaseAdmin.from('snapshot_throttle').upsert(
        {
          cp_id: cpId,
          last_payload_hash: payloadHash,
          last_snapshot_at: new Date().toISOString(),
        },
        { onConflict: 'cp_id' }
      );
    }

    const now = new Date().toISOString();

    const chargerStatus = {
      id: `api-${cpId}`,
      created_at: now,
      cp_id: cpId,
      cp_name: details.locationData?.cuprName || 'Unknown',
      schedule: '24/7',
      overall_update_date: now,
      cp_latitude: details.locationData?.latitude || null,
      cp_longitude: details.locationData?.longitude || null,
      address_full: addressFull,
      ...snapshotData,
    };

    return new Response(JSON.stringify({ station: chargerStatus }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Station details error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

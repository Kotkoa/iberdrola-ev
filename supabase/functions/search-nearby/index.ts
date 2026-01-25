import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IBERDROLA_BASE_URL = 'https://www.iberdrola.es/o/webclipb/iberdrola/puntosrecargacontroller';
const LIST_URL = `${IBERDROLA_BASE_URL}/getListarPuntosRecarga`;
const DETAILS_URL = `${IBERDROLA_BASE_URL}/getDatosPuntoRecarga`;

const KM_PER_DEGREE_LAT = 111;
const DEG_TO_RAD = Math.PI / 180;

const SEARCH_FILTERS = {
  CHARGE_POINT_TYPES: ['P', 'R', 'I', 'N'],
  SOCKET_STATUS: [],
  ADVANTAGEOUS: false,
  CONNECTORS_TYPE: ['2', '7'],
  LOAD_SPEED: [],
};

interface SearchRequest {
  latitude: number;
  longitude: number;
  radiusKm: number;
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
    port2_status: port2?.status?.statusCode || null,
    port2_power_kw: port2?.maxPower || null,
    port2_price_kwh: port2?.appliedRate?.recharge?.finalPrice ?? 0,
    port2_update_date: port2?.status?.updateDate || null,
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

function hasPaidPorts(details: StationDetails): boolean {
  return (
    details.logicalSocket?.some((sock) =>
      sock.physicalSocket?.some(
        (ps) => ps.appliedRate?.recharge?.finalPrice && ps.appliedRate.recharge.finalPrice > 0
      )
    ) ?? false
  );
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

    const { latitude, longitude, radiusKm }: SearchRequest = await req.json();

    if (!latitude || !longitude || !radiusKm) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: latitude, longitude, radiusKm' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const latDelta = radiusKm / KM_PER_DEGREE_LAT;
    const lonDelta = radiusKm / (KM_PER_DEGREE_LAT * Math.cos(latitude * DEG_TO_RAD));

    const listResponse = await fetch(LIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        dto: {
          chargePointTypesCodes: SEARCH_FILTERS.CHARGE_POINT_TYPES,
          socketStatus: SEARCH_FILTERS.SOCKET_STATUS,
          advantageous: SEARCH_FILTERS.ADVANTAGEOUS,
          connectorsType: SEARCH_FILTERS.CONNECTORS_TYPE,
          loadSpeed: SEARCH_FILTERS.LOAD_SPEED,
          latitudeMax: latitude + latDelta,
          latitudeMin: latitude - latDelta,
          longitudeMax: longitude + lonDelta,
          longitudeMin: longitude - lonDelta,
        },
        language: 'en',
      }),
    });

    if (!listResponse.ok) {
      throw new Error(`Iberdrola API error: ${listResponse.status}`);
    }

    const listData = await listResponse.json();
    const stationsList = listData.entidad || [];

    const results = [];

    for (const station of stationsList) {
      const cpId = station.cpId;
      const cuprId = station.locationData?.cuprId;

      if (!cpId || !cuprId) continue;

      const detailsResponse = await fetch(DETAILS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ dto: { cuprId: [cuprId] }, language: 'en' }),
      });

      if (!detailsResponse.ok) continue;

      const detailsData = await detailsResponse.json();
      const details: StationDetails = detailsData.entidad?.[0];

      if (!details) continue;

      const isPaid = hasPaidPorts(details);
      if (isPaid) continue;

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
          source: 'user_nearby',
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

      const logical = details.logicalSocket || [];
      const flattened = logical.flatMap((ls) => ls.physicalSocket || []);
      const availableSockets = flattened.filter((ps) => ps.status?.statusCode === 'AVAILABLE');
      const maxPower = flattened.reduce((acc, ps) => Math.max(acc, ps.maxPower || 0), 0);

      results.push({
        cpId,
        cuprId,
        name: details.locationData?.cuprName || 'Unknown',
        latitude: details.locationData?.latitude || 0,
        longitude: details.locationData?.longitude || 0,
        maxPower,
        freePorts: availableSockets.length,
        addressFull: addressFull || 'Address unknown',
        socketType: flattened[0]?.socketType?.socketName || 'Unknown',
        priceKwh: snapshotData.port1_price_kwh || 0,
        emergencyStopPressed: snapshotData.emergency_stop_pressed,
        ...snapshotData,
      });
    }

    return new Response(JSON.stringify({ stations: results, count: results.length }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Search error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
});

export type NearbyStation = {
  cp_id?: string | number
  [key: string]: unknown
}

type BoundingBox = {
  latitudeMin: number
  latitudeMax: number
  longitudeMin: number
  longitudeMax: number
}

const LOCAL_API_URL = import.meta.env.VITE_NEAREST_STATIONS_URL

const CHARGE_POINT_TYPES_CODES = ['P', 'R', 'I', 'N']
const CONNECTOR_TYPES = ['2', '7']

export function getBoundingBox(
  lat: number,
  lng: number,
  radiusKm = 10
): BoundingBox {
  const kmInDegree = 1 / 111
  const latDelta = radiusKm * kmInDegree
  const lngDelta = (radiusKm * kmInDegree) / Math.cos(lat * (Math.PI / 180))

  return {
    latitudeMin: lat - latDelta,
    latitudeMax: lat + latDelta,
    longitudeMin: lng - lngDelta,
    longitudeMax: lng + lngDelta,
  }
}

/**
 * Try local proxy first, fallback to Iberdrola endpoint.
 * All comments in English.
 */
export async function getNearbyStations(
  radiusKm = 10
): Promise<NearbyStation[]> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not supported on this device.')
  }

  const coords = await new Promise<GeolocationCoordinates>(
    (resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve(coords),
        (error) => reject(error),
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 }
      )
    }
  )

  const { latitude, longitude } = coords
  const box = getBoundingBox(latitude, longitude, radiusKm)

  const payload = {
    dto: {
      chargePointTypesCodes: CHARGE_POINT_TYPES_CODES,
      socketStatus: [],
      advantageous: false,
      connectorsType: CONNECTOR_TYPES,
      loadSpeed: [],
      latitudeMax: box.latitudeMax,
      latitudeMin: box.latitudeMin,
      longitudeMax: box.longitudeMax,
      longitudeMin: box.longitudeMin,
    },
    language: 'en',
  }

  // Always call Supabase Edge Function (proxy)
  const res = await fetch(LOCAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new Error(`get-nearest-charging-points failed: ${res.status}`)
  }

  const data: { entidad?: NearbyStation[] } = await res.json()
  return Array.isArray(data.entidad) ? data.entidad : []
}

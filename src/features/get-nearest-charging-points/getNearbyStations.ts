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

const LOCAL_API_URL = '/api/get-nearest-charging-points'
const IBERDROLA_API_URL =
  'https://www.iberdrola.es/o/webclipb/iberdrola/puntosrecargacontroller/getListarPuntosRecarga'

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

  // Try local API/proxy first (e.g. Netlify function). If it fails, try direct Iberdrola endpoint.
  try {
    const localResp = await fetch(LOCAL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (localResp.ok) {
      const localData: { entidad?: NearbyStation[] } = await localResp.json()
      return Array.isArray(localData.entidad) ? localData.entidad : []
    }
  } catch (e) {
    // ignore and try remote
    // console.debug('Local API failed, falling back to Iberdrola', e)
  }

  // Fallback: direct call to Iberdrola. Note: this may be blocked by CORS in browser;
  // use a server-side proxy if CORS prevents direct calls from phone/browser.
  const res = await fetch(IBERDROLA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`)
  }

  const data: { entidad?: NearbyStation[] } = await res.json()
  return Array.isArray(data.entidad) ? data.entidad : []
}

import { useCallback, useState } from 'react'
import { getNearbyStations, type NearbyStation } from './getNearbyStations'

type UseStationsState = {
  stations: NearbyStation[]
  loading: boolean
  error: Error | null
}

const initialState: UseStationsState = {
  stations: [],
  loading: false,
  error: null,
}

export function useStations(radiusKm = 10) {
  const [state, setState] = useState<UseStationsState>(initialState)

  const fetchStations = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const stations = await getNearbyStations(radiusKm)
      setState({ stations, loading: false, error: null })
      return stations
    } catch (error) {
      const normalizedError =
        error instanceof Error
          ? error
          : new Error('Unable to fetch nearby stations.')
      setState((prev) => ({
        ...prev,
        loading: false,
        error: normalizedError,
      }))
      throw normalizedError
    }
  }, [radiusKm])

  return { ...state, fetchStations }
}

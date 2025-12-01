import { useEffect, useState } from 'react'
import { getLatestChargerStatus } from '../api/charger'
import type { ChargerStatus } from '../types/charger'

export function useCharger() {
  const [data, setData] = useState<ChargerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        setLoading(true)
        const rows = await getLatestChargerStatus()
        if (active) {
          setData(rows?.[0] ?? null)
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'Unknown error')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      active = false
    }
  }, [])

  return { data, loading, error }
}

import { useEffect, useState } from 'react'
import {
  getLatestChargerStatus,
  subscribeToLatestCharger,
} from '../api/charger.js'
import type { ChargerStatus } from '../types/charger'

export function useCharger() {
  const [data, setData] = useState<ChargerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | null = null

    const load = async () => {
      try {
        setLoading(true)
        const rows = await getLatestChargerStatus()
        if (active) {
          setData(rows?.[0] ?? null)
        }

        unsubscribe = subscribeToLatestCharger((newCharger) => {
          if (active) {
            setData(newCharger)
          }
        })
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
      unsubscribe?.()
    }
  }, [])

  return { data, loading, error }
}

import { useEffect, useState } from 'react';
import {
  getLatestChargerStatus,
  getChargerStatusById,
  subscribeToLatestCharger,
  subscribeToCharger,
} from '../api/charger.js';
import type { ChargerStatus } from '../types/charger';

export function useCharger(cpId?: number | null) {
  const [data, setData] = useState<ChargerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    const load = async () => {
      if (cpId === null) {
        setData(null);
        setLoading(false);
        setError(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        if (cpId !== undefined) {
          const charger = await getChargerStatusById(cpId);
          if (active) {
            setData(charger);
          }

          unsubscribe = subscribeToCharger(cpId, (newCharger) => {
            if (active) {
              setData(newCharger);
            }
          });
        } else {
          const rows = await getLatestChargerStatus();
          if (active) {
            setData(rows?.[0] ?? null);
          }

          unsubscribe = subscribeToLatestCharger((newCharger) => {
            if (active) {
              setData(newCharger);
            }
          });
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'Unknown error');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [cpId]);

  return { data, loading, error };
}

import { useCallback, useSyncExternalStore } from 'react';

interface UserLocation {
  latitude: number;
  longitude: number;
}

interface LocationState {
  location: UserLocation | null;
  loading: boolean;
  error: string | null;
}

interface UseUserLocationResult extends LocationState {
  refresh: () => void;
}

let state: LocationState = {
  location: null,
  loading: true,
  error: null,
};
let isInitialized = false;
const subscribers = new Set<() => void>();

function notifySubscribers() {
  subscribers.forEach((callback) => callback());
}

function initializeLocation() {
  if (isInitialized) return;
  isInitialized = true;

  if (!navigator.geolocation) {
    state = { ...state, error: 'Geolocation is not supported', loading: false };
    notifySubscribers();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      state = {
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        loading: false,
        error: null,
      };
      notifySubscribers();
    },
    (err) => {
      state = { location: null, loading: false, error: err.message };
      notifySubscribers();
    },
    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000,
    }
  );
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  initializeLocation();
  return () => subscribers.delete(callback);
}

function getSnapshot(): LocationState {
  return state;
}

export function useUserLocation(): UseUserLocationResult {
  const currentState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refresh = useCallback(() => {
    if (!navigator.geolocation) return;

    state = { ...state, loading: true, error: null };
    notifySubscribers();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        state = {
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          loading: false,
          error: null,
        };
        notifySubscribers();
      },
      (err) => {
        state = { location: null, loading: false, error: err.message };
        notifySubscribers();
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, []);

  return { ...currentState, refresh };
}

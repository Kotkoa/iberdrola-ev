/// <reference types="vite/client" />

import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set');
}

export const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_ANON_KEY ?? '');

interface FetchOptions {
  signal?: AbortSignal;
  timeout?: number;
}

export async function supabaseFetch<T = unknown>(
  endpoint: string,
  options?: FetchOptions
): Promise<T> {
  const base = (SUPABASE_URL ?? '').replace(/\/$/, '');
  const url = `${base}/rest/v1/${endpoint}`;

  const timeout = options?.timeout ?? 10000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  if (options?.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY ?? '',
        Authorization: `Bearer ${SUPABASE_ANON_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Supabase request failed: ${res.status}`);
    }

    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeoutId);
  }
}

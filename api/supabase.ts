/// <reference types="vite/client" />

import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set')
}

export const supabase = createClient(
  SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY ?? ''
)

export async function supabaseFetch<T = unknown>(endpoint: string): Promise<T> {
  const base = (SUPABASE_URL ?? '').replace(/\/$/, '')
  const url = `${base}/rest/v1/${endpoint}`

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY ?? '',
      Authorization: `Bearer ${SUPABASE_ANON_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Supabase request failed: ${res.status}`)
  }

  return res.json() as Promise<T>
}

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export async function supabaseFetch<T = unknown>(endpoint: string): Promise<T> {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  })

  if (!res.ok) {
    throw new Error(`Supabase request failed: ${res.status}`)
  }

  return res.json() as Promise<T>
}

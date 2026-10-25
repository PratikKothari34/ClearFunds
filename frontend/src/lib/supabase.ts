import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!SUPABASE_URL || !KEY) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set (frontend/.env.local)')
}

export const supabase = createClient<Database>(SUPABASE_URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** A refusal the server wrote for the person reading it. */
export class Refused extends Error {}

/** Calls the signing edge function as the signed-in admin. */
export async function edge<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Refused('Sign in again.')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/api${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Refused(out.error ?? 'The server could not do that.')
  return out as T
}

/** Postgres refuses a rule with SQLSTATE P0001 and a sentence for the user. */
export function unwrap<R extends { data: unknown; error: { code?: string; message: string } | null }>(
  r: R,
): NonNullable<R['data']> {
  if (r.error) throw r.error.code === 'P0001' ? new Refused(r.error.message) : new Error(r.error.message)
  return r.data as NonNullable<R['data']>
}

/** bytea arrives as "\x…"; the contract's hex has no prefix. */
export const bytea = (s: string) => (s.startsWith('\\x') ? s.slice(2) : s)

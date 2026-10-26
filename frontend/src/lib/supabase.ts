import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

let real: SupabaseClient<Database> | undefined

/**
 * Throws on FIRST USE, never at import.
 *
 * Importing this module must stay free of side effects: `verify.ts` pulls it in
 * through `api.ts`, so a throw here took down every test that touched the
 * chain checker - but only on a machine without `frontend/.env.local`, which is
 * git-ignored. It therefore passed locally and failed from a clean checkout.
 * Nothing committed may depend on an ignored file.
 */
function client() {
  if (!SUPABASE_URL || !KEY) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set (frontend/.env.local)')
  }
  real ??= createClient<Database>(SUPABASE_URL, KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
  return real
}

/** The client, built on the first property read so the import stays inert. */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get: (_, prop, recv) => Reflect.get(client(), prop, recv),
  set: (_, prop, value, recv) => Reflect.set(client(), prop, value, recv),
  has: (_, prop) => Reflect.has(client(), prop),
})

/** A refusal the server wrote for the person reading it. */
export class Refused extends Error {}

/** Calls the signing edge function as the signed-in admin. */
export async function edge<T>(path: string, body: unknown): Promise<T> {
  client() // same check before KEY is read below
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

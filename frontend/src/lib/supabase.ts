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

/*
 * `Refused` and `Unreachable` are declared in `lib/reachable.ts`, which
 * imports nothing, and re-exported here so every existing
 * `from '../lib/supabase'` keeps working. They must have exactly ONE
 * declaration: two classes of the same name would make `instanceof` false
 * across module boundaries, and every write surface in the app decides
 * whether to quote the server by exactly that test.
 */
import { Refused, Unreachable } from './reachable'
export { Refused, Unreachable, unreachable } from './reachable'

/*
 * Calls the signing edge function as the signed-in admin.
 *
 * Returns `unknown` on purpose, and takes NO type argument. `edge<{ seq:
 * number }>(...)` was a cast with nothing checking a field, so a response
 * missing `seq` arrived as `undefined` typed `number` - the same hole `all`
 * in api.ts closed for views. The caller must run it through a parser.
 */
export async function edge(path: string, body: unknown): Promise<unknown> {
  client() // same check before KEY is read below
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Refused('Sign in again.')
  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/api${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    /*
     * The request never left, or no answer came back. Nothing was recorded,
     * and that is the part the caller must be able to say truthfully - a
     * write surface that cannot tell this from a refusal has to hedge, and
     * "it may or may not have gone through" is the worst thing to tell
     * someone about money.
     */
    throw new Unreachable('The request did not reach the server.', { cause: e })
  }

  /*
   * A body that will not parse is NOT a refusal. It used to fall through to
   * `?? 'The server could not do that.'`, which puts a server's voice on a
   * dropped connection. Which of the two it is depends on the status: an
   * error status with an unparseable body is still the server answering, so
   * it keeps the refusal wording; a 2xx whose body arrived truncated is a
   * transport failure.
   */
  let out: { error?: string } | null = null
  try {
    out = (await res.json()) as { error?: string }
  } catch {
    if (res.ok) throw new Unreachable('The answer did not arrive in full.')
  }
  if (!res.ok) throw new Refused(out?.error ?? 'The server could not do that.')
  if (out === null) throw new Unreachable('The answer did not arrive in full.')
  return out
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

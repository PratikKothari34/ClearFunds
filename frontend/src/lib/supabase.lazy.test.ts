import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The module must stay inert on import and still refuse on use.
 *
 * `verify.ts` imports `api.ts` imports this, so a throw at import time failed
 * every chain-checker test - but only without `frontend/.env.local`, which is
 * git-ignored, so it passed locally and failed from a clean checkout.
 *
 * Both halves matter. Deleting the Proxy brings the import-time throw back;
 * dropping the `client()` call in `edge()` makes a misconfigured app fail later
 * with a confusing error instead of this one. Do not "simplify" either away.
 *
 * The env is STUBBED rather than read, because a test that only fails when
 * `.env.local` is absent is the very bug this guards - it would pass on a
 * developer machine and in CI for opposite reasons.
 */
describe('supabase env guard, with the variables missing', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('importing the module does not throw', async () => {
    const m = await import('./supabase')
    expect(m.Refused).toBeTypeOf('function')
  })

  it('but using the client throws the configuration error', async () => {
    const { supabase } = await import('./supabase')
    expect(() => supabase.from('flats')).toThrow(/VITE_SUPABASE_URL/)
  })

  it('and so does the edge function, which reads the key directly', async () => {
    const { edge } = await import('./supabase')
    await expect(edge('/x', {})).rejects.toThrow(/VITE_SUPABASE_URL/)
  })
})

describe('supabase env guard, with the variables present', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://stub.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'stub-key')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('builds a real client and reaches through the proxy', async () => {
    const { supabase } = await import('./supabase')
    expect(supabase.from('flats')).toBeTypeOf('object')
    expect(supabase.auth).toBeTypeOf('object')
  })

  it('returns the same client on every access, so sessions are not rebuilt', async () => {
    const { supabase } = await import('./supabase')
    expect(supabase.auth).toBe(supabase.auth)
  })
})

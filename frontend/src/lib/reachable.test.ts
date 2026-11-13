/*
 * A dropped connection must not speak with the server's voice.
 *
 * `Failed` printed `error.message` raw, so a resident on the stated device
 * target - a mid-range Android on working 4G - read "TypeError: Failed to
 * fetch" where a sentence about their connection belonged. Worse, a response
 * truncated mid-answer parsed as `{}` and became `Refused('The server could
 * not do that.')`: telling someone the server declined when the network
 * dropped. On a ledger, "the server refused" and "the request never arrived"
 * are different facts about whether anything was recorded.
 *
 * These assertions are on the CLASSIFICATION, not on the copy. The wording is
 * a render decision and `ui.tsx` owns it; which of the three a thrown value
 * IS, is the decision, and it is made here and in `edge()`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Refused, Unreachable, unreachable } from './reachable'

describe('unreachable(): what the value IS, never what it says', () => {
  it('a fetch rejection is unreachable, whatever the browser worded it', () => {
    /*
     * `fetch` rejects with a TypeError for DNS failure, a refused connection,
     * a request dropped mid-flight and a CORS rejection, and the message
     * differs per engine: "Failed to fetch" (Chromium), "NetworkError when
     * attempting to fetch resource." (Firefox), "Load failed" (WebKit). A
     * check on the message would pass here and stop working the day one of
     * them is reworded - green forever, correct never. Hence all three.
     */
    for (const m of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed']) {
      expect(unreachable(new TypeError(m)), m).toBe(true)
    }
  })

  it('our own Unreachable is too', () => {
    expect(unreachable(new Unreachable('The request did not reach the server.'))).toBe(true)
  })

  it('a refusal is NOT - it is the server answering, and gets quoted', () => {
    expect(unreachable(new Refused('Only the treasurer can post this.'))).toBe(false)
  })

  it('an abort is NOT, so a navigated-away request does not claim the network failed', () => {
    /*
     * `AbortError` is a DOMException, never a TypeError, so it falls through
     * with no clause written for it. That is exactly why it needs a test: the
     * behaviour is correct by a fact about the platform, not by anything
     * visible in `reachable.ts`, and someone reading that file could add
     * `|| e instanceof DOMException` believing it widens coverage when it
     * would start reporting a cancelled request as a dead connection.
     */
    expect(unreachable(new DOMException('aborted', 'AbortError'))).toBe(false)
    expect(new DOMException('aborted', 'AbortError')).not.toBeInstanceOf(TypeError)
  })

  it('a bare Error is NOT, so a bug of ours is not blamed on the connection', () => {
    expect(unreachable(new Error('cannot read properties of undefined'))).toBe(false)
  })

  it('and neither is a non-Error, which a thrown string or null can be', () => {
    for (const v of [null, undefined, 'Failed to fetch', 0, {}]) {
      expect(unreachable(v), String(v)).toBe(false)
    }
  })

  it('Refused and Unreachable are distinguishable, not two names for Error', () => {
    /*
     * Every write surface in the app decides whether to quote the server by
     * `instanceof Refused`. If the two shared a prototype - or if a second
     * declaration of either existed in another module - that test would answer
     * wrongly and a network failure would be presented as the committee's own
     * rule refusing.
     */
    expect(new Unreachable('x')).not.toBeInstanceOf(Refused)
    expect(new Refused('x')).not.toBeInstanceOf(Unreachable)
    expect(new Refused('x')).toBeInstanceOf(Error)
  })

  it('supabase.ts re-exports these, it does not declare its own', async () => {
    /*
     * The one import that must stay a re-export. Two same-named classes make
     * `instanceof` false across module boundaries, and the failure is silent:
     * the throw still happens, the catch still runs, and the branch that
     * quotes the server is simply never taken.
     */
    const s = await import('./supabase')
    expect(s.Refused).toBe(Refused)
    expect(s.Unreachable).toBe(Unreachable)
    expect(s.unreachable).toBe(unreachable)
  })
})

/*
 * `edge()`'s three outcomes. Driven through a stubbed `fetch` because the
 * decision is which error class leaves the function, and nothing downstream
 * can recover it once it has been chosen.
 */
describe('edge(): a transport failure is never reported as a refusal', () => {
  const session = { data: { session: { access_token: 't' } } }

  /*
   * `vi.resetModules()` gives each case a fresh graph, so the `Refused` the
   * reloaded `supabase.ts` throws is NOT the `Refused` imported at the top of
   * this file - a second declaration, created by the harness rather than by
   * the source. Asserting against the statically-imported class failed all
   * five of these cases while every message was already correct, which is a
   * live demonstration of why the single-declaration rule matters: the
   * identity test answers wrongly and nothing else looks wrong.
   *
   * So the classes come back from the SAME graph as the function under test.
   * The static imports are still what the pure `unreachable()` cases above
   * use, and the re-export case asserts the identity that production relies
   * on - there, both sides come from one graph because nothing resets it.
   */
  async function edgeWith(f: typeof fetch) {
    vi.stubGlobal('fetch', f)
    const m = await import('./supabase')
    vi.spyOn(m.supabase.auth, 'getSession').mockResolvedValue(session as never)
    return m
  }

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://stub.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'stub-key')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('the request never leaving is Unreachable, with the cause kept', async () => {
    const cause = new TypeError('Failed to fetch')
    const m = await edgeWith(() => Promise.reject(cause))
    const e = await m.edge('/x', {}).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(m.Unreachable)
    expect(e).not.toBeInstanceOf(m.Refused)
    // Kept so a console still shows what the browser actually said.
    expect((e as Error).cause).toBe(cause)
  })

  it('a 2xx whose body arrived truncated is Unreachable, not a refusal', async () => {
    /*
     * This was the misattribution. `res.json().catch(() => ({}))` turned a
     * half-arrived answer into an empty object, which then fell through to
     * `?? 'The server could not do that.'`. A 200 means the server did do it;
     * only the answer was lost.
     */
    const m = await edgeWith(() => Promise.resolve(new Response('{"seq":1', { status: 200 })))
    const e = await m.edge('/x', {}).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(m.Unreachable)
    expect(e).not.toBeInstanceOf(m.Refused)
  })

  it('an error status with an unparseable body STAYS a refusal', async () => {
    /*
     * The other side of the same line, and the reason the status is what
     * decides rather than the parse result. A 403 from the gateway with an
     * HTML body is still the server answering: calling it a connection
     * failure would offer a retry that cannot ever succeed.
     */
    const m = await edgeWith(() => Promise.resolve(new Response('<html>denied', { status: 403 })))
    const e = await m.edge('/x', {}).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(m.Refused)
    expect(e).not.toBeInstanceOf(m.Unreachable)
  })

  it('an error status with a message is refused IN THE SERVER’S WORDS', async () => {
    const m = await edgeWith(() =>
      Promise.resolve(new Response('{"error":"Only the treasurer can post this."}', { status: 400 })),
    )
    const e = await m.edge('/x', {}).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(m.Refused)
    expect((e as Error).message).toBe('Only the treasurer can post this.')
  })

  it('a good answer comes back as the parsed body', async () => {
    const m = await edgeWith(() => Promise.resolve(new Response('{"seq":7}', { status: 200 })))
    await expect(m.edge('/x', {})).resolves.toEqual({ seq: 7 })
  })

  it('no session is a refusal - signing in again is the fix, not retrying', async () => {
    /*
     * And the fetch must not even be attempted: a request with no token would
     * come back 401, which is a refusal either way, so the branch is invisible
     * in the result. The stub rejecting is what proves it was not called.
     */
    const m = await edgeWith(() => Promise.reject(new Error('fetch must not be called')))
    vi.spyOn(m.supabase.auth, 'getSession').mockResolvedValue({ data: { session: null } } as never)
    const e = await m.edge('/x', {}).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(m.Refused)
    expect((e as Error).message).toBe('Sign in again.')
  })
})

describe('the Failed surface quotes the server only when the server spoke', () => {
  it('reads unreachable() rather than re-deriving the test', async () => {
    /*
     * The chain is `ui.tsx` -> `failureKind()` -> `unreachable()`, and the
     * thing that would break silently is either file growing its own
     * `error instanceof TypeError` check - correct the day it is written, then
     * wrong the first time `edge()` classifies something it has not heard of.
     * A source read, because the decision is which function is called.
     */
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const read = (...p: string[]) => readFileSync(join(import.meta.dirname, '..', ...p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const ui = read('components', 'ui.tsx')
    const failure = read('lib', 'failure.ts')

    expect(ui, 'ui.tsx stopped calling failureKind()').toMatch(/failureKind\(\s*error\s*\)/)
    expect(failure, 'failure.ts stopped calling unreachable()').toMatch(/unreachable\(\s*error\s*\)/)
    for (const [name, src] of [['ui.tsx', ui], ['failure.ts', failure]] as const) {
      expect(src, `${name} grew its own network test instead of calling unreachable()`)
        .not.toMatch(/instanceof\s+TypeError/)
      // Every route imports ui.tsx, so the import graph is the budget: neither
      // file may reach these classes through the SDK.
      expect(src, `${name} must not import from lib/supabase`).not.toMatch(/from\s+'(\.\.\/lib|\.)\/supabase'/)
    }
    expect(ui).toMatch(/from\s+'\.\.\/lib\/failure'/)
    expect(failure).toMatch(/from\s+'\.\/reachable'/)
  })
})

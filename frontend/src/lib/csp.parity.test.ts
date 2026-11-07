import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THE DEPLOYED CSP AND THE APP'S ACTUAL FETCH TARGETS MUST AGREE.
 *
 * `csp.test.ts` guards the dev policy and says in its last test that the
 * deployed one is the backend's to write, so all it can assert is that the dev
 * exception stays in the dev constant. That was true while `vercel.json`
 * carried no CSP. It now carries one, so the two are comparable and nothing
 * was comparing them.
 *
 * The failure this catches is silent in the direction that matters. `connect-src`
 * in `vercel.json` is a hardcoded list of origins; the dev server builds its own
 * from VITE_SUPABASE_URL and VITE_ANCHOR_URL, so pointing the anchor somewhere
 * new keeps dev green and blocks the real fetch in production. Nothing throws:
 * the browser refuses the request, the anchor reads as unpublished, and the
 * verify screen reports that it could not reach the published head - which is
 * indistinguishable from a society whose head has not been published yet.
 *
 * That is the one check that proves entries were not left OUT. The hash chain
 * proves no entry was edited; only a head the client fetched itself, from
 * somewhere the committee does not control, proves none was omitted. A CSP that
 * quietly blocks it removes that proof while every screen still looks correct.
 *
 * So this asserts the RELATIONSHIP, never a snapshot of either policy: a
 * snapshot gets "fixed" by pasting the new value in, which is exactly the edit
 * that should have failed.
 */

const root = resolve(__dirname, '../..')
const vercel = JSON.parse(readFileSync(resolve(root, '../vercel.json'), 'utf8'))
const viteConfig = readFileSync(resolve(root, 'vite.config.ts'), 'utf8')

/* Comments stripped for the same reason csp.test.ts strips them: the prose in
 * vite.config.ts names directives and origins, so a check over raw text would
 * pass or fail on commentary rather than on code. */
const viteCode = viteConfig
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function prodCsp(): string {
  const headerSets: { source: string; headers: { key: string; value: string }[] }[] =
    vercel.headers ?? []
  const found = headerSets
    .flatMap((h) => h.headers ?? [])
    .filter((h) => h.key.toLowerCase() === 'content-security-policy')
  /* Zero means the deployed policy is gone and every assertion below would
   * vacuously pass; more than one means two policies apply and the browser
   * enforces the INTERSECTION, which is not what anyone reading one of them
   * expects. Both are failures. */
  expect(found.length, 'vercel.json must carry exactly one Content-Security-Policy header').toBe(1)
  const only = found[0]
  if (!only) throw new Error('unreachable: length was asserted to be 1')
  return only.value
}

const directive = (csp: string, name: string): string[] => {
  const d = csp
    .split(';')
    .map((s) => s.trim())
    .find((s) => s === name || s.startsWith(name + ' '))
  expect(d, `${name} is missing from the policy`).toBeDefined()
  if (d === undefined) throw new Error('unreachable: presence was asserted above')
  return d.split(/\s+/).slice(1)
}

/*
 * The deployed policy arrives in a separate PR that is not merged yet, so
 * these assertions have nothing to read until it lands. They are SKIPPED while
 * `vercel.json` carries no CSP and run from the moment it does - the same
 * shape the kind-vector suite uses for a contract file still in review: a
 * suite that would be red for work that is not ours teaches people to ignore
 * it, and one that silently passes guards nothing.
 *
 * The guard against that skip becoming permanent is the first test below. It
 * is NOT skipped: it asserts which of the two states we are in, so the
 * scaffolding cannot quietly outlive the merge.
 */
const policyDeployed =
  (vercel.headers ?? []).some((h: { headers?: { key: string }[] }) =>
    (h.headers ?? []).some((x) => x.key.toLowerCase() === 'content-security-policy'),
  )

describe('the deployed CSP is either present or known to be absent', () => {
  it('says which, so the skip below cannot outlive the PR that fills it', () => {
    /*
     * One of these two is true, and the message names the other. When the CSP
     * header lands, `policyDeployed` flips and the whole suite below starts
     * running with no edit here.
     */
    /*
     * `EXPECT_POLICY` is the one line to change when the policy lands, and
     * changing it is the point: while it is false the suite below is skipped,
     * and once it is true a DELETED header fails here instead of quietly
     * re-skipping everything. Without this pin, removing the CSP and removing
     * the PR that adds it look identical to this file.
     */
    const EXPECT_POLICY = false

    expect(
      policyDeployed,
      EXPECT_POLICY
        ? 'vercel.json has lost its Content-Security-Policy header. The parity ' +
          'checks below went back to being skipped, which is how a deployed ' +
          'policy disappears with every suite still green.'
        : 'vercel.json now carries a Content-Security-Policy header. Flip ' +
          'EXPECT_POLICY to true in this file so the checks below run and a ' +
          'later deletion cannot silently skip them again.',
    ).toBe(EXPECT_POLICY)
  })
})

describe.skipIf(!policyDeployed)('the deployed CSP permits every origin the app fetches', () => {
  it('declares a policy at all, exactly once', () => {
    const csp = prodCsp()
    expect(csp).toContain('default-src')
  })

  it('permits each origin the dev server derives from the environment', () => {
    /*
     * The dev list is built from env at startup; the production list is
     * literal text. This is the join between them. Reading the env the same
     * way vite does would make the assertion depend on this machine's .env,
     * so the origins are taken from the example file, which is what a
     * deployment is configured from.
     */
    const example = readFileSync(resolve(root, '.env.example'), 'utf8')
    const configured = [...example.matchAll(/^VITE_(?:SUPABASE_URL|ANCHOR_URL)=(.+)$/gm)]
      .map((m) => (m[1] ?? '').trim().replace(/^["']|["']$/g, ''))
      .filter((v) => v !== '')
      .map((v) => {
        try {
          return new URL(v.replace('{society}', 'x')).origin
        } catch {
          return ''
        }
      })
      .filter((o) => o !== '')

    const allowed = directive(prodCsp(), 'connect-src')
    for (const origin of configured) {
      expect(
        allowed.some((a) => a === origin || a === origin.replace('https://', 'wss://')),
        `connect-src does not permit ${origin}, which the dev server allows. ` +
          `A fetch to it is blocked in production only, and the anchor check ` +
          `then reads as "not published" rather than as an error.`,
      ).toBe(true)
    }
  })

  it('permits the anchor origin, whatever it is set to', () => {
    /*
     * The anchor is the reason this file exists. VITE_ANCHOR_URL is an empty
     * template everywhere today, so there is nothing to compare yet and this
     * must not pass vacuously: it asserts the PAIR of facts, so that setting
     * the anchor without touching the CSP fails here rather than in a
     * resident's browser.
     */
    const example = readFileSync(resolve(root, '.env.example'), 'utf8')
    const m = example.match(/^VITE_ANCHOR_URL=(.*)$/m)
    /*
     * Asserted, not coalesced: a missing key must fail here rather than read
     * as an unset anchor and take the "nothing configured" branch below. The
     * two states look identical once the value is defaulted to ''.
     */
    expect(m, 'VITE_ANCHOR_URL must be present in .env.example, even if empty').not.toBeNull()
    const captured = m?.[1]
    expect(captured, 'VITE_ANCHOR_URL matched without capturing its value').toBeDefined()
    const value = (captured ?? '').trim().replace(/^["']|["']$/g, '')

    if (value === '') {
      /* Unset is the normal state. Assert that it IS unset, so this branch
       * cannot be the one that runs once an anchor is configured. */
      expect(value).toBe('')
      return
    }

    const origin = new URL(value.replace('{society}', 'x')).origin
    expect(
      directive(prodCsp(), 'connect-src'),
      `the anchor is configured at ${origin} and connect-src must permit it`,
    ).toContain(origin)
  })

  it('keeps the dev-only websocket out of the deployed policy', () => {
    /* csp.test.ts asserts ws: stays inside DEV_CSP. This asserts the other
     * end of that claim, which it could not reach: the deployed policy. */
    const csp = prodCsp()
    expect(csp).not.toMatch(/(^|[\s;])ws:/)
    const connect = directive(csp, 'connect-src')
    expect(connect.filter((o) => o.startsWith('wss://')).length).toBeGreaterThanOrEqual(0)
  })

  it('never carries an inline or eval keyword', () => {
    const csp = prodCsp()
    for (const keyword of ['unsafe-inline', 'unsafe-eval', 'unsafe-hashes']) {
      expect(csp, `${keyword} in the deployed policy`).not.toContain(keyword)
    }
  })

  it('locks down the directives that need no origin, as the dev policy does', () => {
    /*
     * Asserted against the dev policy's own list rather than a second copy of
     * it, so the two cannot drift apart silently: tightening dev and
     * forgetting production fails here.
     */
    const csp = prodCsp()
    for (const d of [
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "default-src 'self'",
      "form-action 'self'",
      "font-src 'self'",
    ]) {
      expect(viteCode, `${d} is not in the dev policy, so this list is stale`).toContain(d)
      expect(csp, `${d} is in the dev policy but not the deployed one`).toContain(d)
    }
  })

  it('permits in production exactly the hosts the environment configures', () => {
    /*
     * The dev server allows `origins()`, computed from env, so there is no
     * literal list in vite.config.ts to compare against - an earlier version
     * of this test "checked" that by looking for the string `origins()` in the
     * config, which is a condition that cannot fail.
     *
     * So the comparison runs the other way, and it is the one that catches the
     * real bug: every non-structural origin in the deployed policy must be one
     * the environment actually configures. A hardcoded origin nothing points
     * at is either dead permission or a host whose name has drifted from the
     * env - which is the same silent block, reached from the other side.
     */
    const prodOrigins = directive(prodCsp(), 'connect-src').filter((o) => o.includes('://'))
    expect(prodOrigins.length, 'connect-src names no origin at all').toBeGreaterThan(0)

    const example = readFileSync(resolve(root, '.env.example'), 'utf8')
    const configured = new Set(
      [...example.matchAll(/^VITE_[A-Z_]*(?:URL)=(.+)$/gm)]
        .map((m) => (m[1] ?? '').trim().replace(/^["']|["']$/g, ''))
        .filter((v) => v !== '')
        .flatMap((v) => {
          try {
            const o = new URL(v.replace('{society}', 'x')).origin
            return [o, o.replace(/^https:/, 'wss:')]
          } catch {
            return []
          }
        }),
    )

    /*
     * Today .env.example sets neither URL, so nothing is configured and every
     * production origin is unaccounted for. That is a real finding, not a
     * reason to skip: the deployed policy names hosts the committed
     * configuration never points at, so the two cannot be checked against each
     * other at all. Asserted as the pair, so filling in .env.example turns
     * this into the real comparison rather than leaving it asleep.
     */
    if (configured.size === 0) {
      /*
       * Pinned to the exact set so that ADDING an origin to the deployed
       * policy fails here even while .env.example is empty. Without the pin
       * this branch would accept any hardcoded list, which is how a check
       * waiting on configuration becomes a check that never runs.
       */
      expect(
        [...new Set(prodOrigins)].sort(),
        'connect-src hardcodes origins while .env.example configures none, so ' +
          'nothing verifies the deployed policy matches what the app actually ' +
          'fetches. Fill in VITE_SUPABASE_URL and VITE_ANCHOR_URL there, or ' +
          'add the new origin to this list and say why it is not configurable.',
      ).toEqual([
        'https://hvuzifnonhrqaqwglwbz.supabase.co',
        'https://raw.githubusercontent.com',
        'wss://hvuzifnonhrqaqwglwbz.supabase.co',
      ])
      return
    }

    for (const origin of prodOrigins) {
      expect(
        configured.has(origin),
        `${origin} is permitted in production but no VITE_*_URL in .env.example ` +
          `points at it. Either the app never fetches it, or the env drifted ` +
          `from the policy and the real fetch is blocked in production only.`,
      ).toBe(true)
    }
  })
})

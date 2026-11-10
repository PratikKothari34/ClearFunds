import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * THE DEPLOYED CSP AND THE APP'S ACTUAL FETCH TARGETS MUST AGREE.
 *
 * `csp.test.ts` guards the dev policy and says in its last test that the
 * deployed one is the backend's to write, so all it can assert is that the dev
 * exception stays in the dev constant. Nothing was comparing the two.
 *
 * STATE: `vercel.json` now carries a real Content-Security-Policy, so every
 * assertion below RUNS. The `skipIf` reads the file rather than a hand-flipped
 * flag, which is why the merge that added the policy needed no edit here. Do
 * not re-describe this suite as skipped without re-reading `vercel.json`.
 *
 * The limit that remains, stated rather than papered over: this suite reads
 * the repository, not a response. It would now fail loudly on a diff that
 * deleted the header, but it cannot tell a policy that is merged from one that
 * is actually DEPLOYED. Only a check against a deployed response closes that.
 *
 * The second limit is this file's own inputs. Both directions of the origin
 * comparison are driven by `.env.example`, so a value emptied there empties
 * the comparison: every assertion passes while nothing is compared. That is
 * the "a check whose pattern matches nothing reports success forever" failure,
 * so the invariant is asserted directly in `configuredOrigins` below rather
 * than left to the warning in that file's header.
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
 * The policy HAS LANDED - `vercel.json` carries it, so `policyDeployed` is
 * true and all of the assertions below run. This condition was written while
 * the policy was still in another PR, to keep the suite from going red for
 * work that was not ours; that reason has expired.
 *
 * It is kept rather than deleted because the thing it still distinguishes is
 * real: a tree that has not yet been given a CSP. But note what it now costs,
 * because the condition is permanent in this repo - if someone DELETES the
 * policy from `vercel.json`, this suite silently drops from eight assertions
 * to one instead of failing. That is the shape a skipped block always has, and
 * the first test below is the only thing standing in for it.
 *
 * The first test is NOT skipped. It asserts what holds in both states: the
 * headers array parses, at most one policy is declared, and any policy
 * present covers every route rather than one path. It cannot tell "never
 * configured" from "deleted" - closing that needs a check against a deployed
 * response, not a committed file.
 */
const policyDeployed =
  (vercel.headers ?? []).some((h: { headers?: { key: string }[] }) =>
    (h.headers ?? []).some((x) => x.key.toLowerCase() === 'content-security-policy'),
  )

/*
 * Every origin `.env.example` configures, with the variable that set it, and
 * THE ASSERTION THAT THERE IS AT LEAST ONE.
 *
 * That assertion is the point of the helper. Both directions of the origin
 * comparison iterate this list, so an empty list makes both loops bodies that
 * never run - eight green tests over a policy permitting anything at all.
 * Emptying `VITE_SUPABASE_URL` in `.env.example` is a one-character edit that
 * does exactly that, and the file's header warns a reader but enforces
 * nothing. A check that silently measures nothing reports success forever, so
 * the floor is asserted here, once, where both callers get it.
 *
 * The NAME is carried because the two directions need different sets and only
 * the name distinguishes them: Supabase is reached over https and wss (the
 * realtime channel), while the anchor is a plain fetch of a static file.
 */
function configuredOrigins(example: string): { name: string; origin: string }[] {
  const entries = [...example.matchAll(/^(VITE_[A-Z_]*URL)=(.+)$/gm)]
    .map((m) => ({ name: m[1] ?? '', raw: (m[2] ?? '').trim().replace(/^["']|["']$/g, '') }))
    .filter((e) => e.raw !== '')
    .flatMap((e) => {
      try {
        return [{ name: e.name, origin: new URL(e.raw.replace('{society}', 'x')).origin }]
      } catch {
        return []
      }
    })

  expect(
    entries.length,
    'No VITE_*URL in .env.example resolves to an origin, so both directions of ' +
      'this comparison iterate an empty list and every assertion below passes ' +
      'without comparing anything. Restore the deployment origin there - every ' +
      'value in that file is public by construction, so there is nothing to ' +
      'protect by leaving it blank.',
  ).toBeGreaterThan(0)

  /* VITE_SUPABASE_URL specifically, because it is the one the app cannot run
   * without and the only one requiring a wss origin. Named rather than counted:
   * a different URL arriving later would satisfy the count above while leaving
   * the Supabase comparison empty. */
  expect(
    entries.map((e) => e.name),
    'VITE_SUPABASE_URL must resolve to an origin in .env.example; it is the ' +
      'origin every data read goes to, so without it the policy is unchecked ' +
      'against the one host that matters most.',
  ).toContain('VITE_SUPABASE_URL')

  return entries
}

describe('the deployed policy is declared unambiguously', () => {
  it('declares at most one CSP, covering every route', () => {
    /*
     * NOTHING HERE IS FLIPPED BY HAND. An earlier version of this file pinned
     * the expectation to a hardcoded `false`, so the merge that adds the
     * policy had to edit this line or go red: whichever of #101 and this
     * merged second failed, and the fix sat in a different lane from the
     * change that caused it. That trap was worse than the one it guarded.
     *
     * What this test can prove without knowing which state we are in:
     *
     *   - the headers array parses at all, so a malformed file fails loudly
     *     instead of making every check below vacuously true
     *   - AT MOST ONE policy, because a browser enforces the intersection of
     *     all of them, so a second policy silently narrows the first
     *   - any policy present covers every route, not one path
     *
     * The deliberate limit, stated rather than papered over: while no policy
     * exists this file CANNOT tell "#101 has not merged" from "the policy was
     * deleted", because `vercel.json` carries no record of having had one. So
     * a deletion returns the comparison suite to skipped. What closes that is
     * CI asserting the header on a deployed preview - a live response, which
     * no test reading a committed file can replace. Named in the PR rather
     * than left as a silent gap.
     */
    expect(Array.isArray(vercel.headers), 'vercel.json has no headers array to read').toBe(true)

    const policies = (vercel.headers ?? []).flatMap(
      (h: { source?: string; headers?: { key: string; value: string }[] }) =>
        (h.headers ?? [])
          .filter((x) => x.key.toLowerCase() === 'content-security-policy')
          .map((x) => ({ source: h.source, value: x.value })),
    )

    expect(
      policies.length,
      'vercel.json declares more than one Content-Security-Policy. A browser ' +
        'enforces the intersection of all of them, so a second policy ' +
        'silently narrows the first and no single header reads as wrong.',
    ).toBeLessThanOrEqual(1)

    if (policies.length === 1) {
      expect(
        policies[0]?.source,
        'the Content-Security-Policy is scoped to a path instead of /(.*), so ' +
          'it does not cover every route the SPA serves',
      ).toBe('/(.*)')
    }
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
    const configured = configuredOrigins(example).map((e) => e.origin)

    /*
     * DELIBERATELY THE LOOSE CHECK, and the strict one lives in "permits in
     * production exactly the hosts the environment configures" below.
     *
     * This accepts either scheme for a configured origin, so a policy carrying
     * only `wss://...supabase.co` satisfies it even though every ordinary read
     * over https would be blocked. That is not an oversight left here: this
     * test's question is "did a configured host vanish from the policy
     * entirely", which is the one a reader of this assertion expects it to
     * answer. The scheme-exact requirement is a different question and gets
     * its own assertion.
     *
     * THE TWO OVERLAP, so neither can be mutation-killed alone over a policy
     * that keeps one scheme: dropping `https://...supabase.co` while `wss:`
     * remains passes THIS test and fails the strict one. Mutated both at once
     * to prove the pair is real rather than one being dead code - said here
     * and in the PR, because a reviewer reading mutation scores will otherwise
     * read the overlap as redundancy worth deleting.
     */
    const allowed = directive(prodCsp(), 'connect-src')
    for (const origin of configured) {
      expect(
        allowed.some((a) => a === origin || a === origin.replace('https://', 'wss://')),
        `connect-src does not permit ${origin} under EITHER scheme, so the host ` +
          `the dev server allows is absent from the deployed policy entirely. ` +
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

    const configuredEntries = configuredOrigins(example)

    /*
     * The PERMISSIVE set, for checking the policy does not permit an origin
     * nothing configures. The wss: variant belongs here because a Supabase
     * origin in the policy is accounted for whichever scheme it carries.
     */
    const configured = new Set(
      configuredEntries.flatMap((e) => [e.origin, e.origin.replace(/^https:/, 'wss:')]),
    )

    /*
     * The REQUIRED set, for the other direction: origins the app actually
     * fetches and the policy must therefore name. A wss: origin is required
     * only where something opens a socket, which is Supabase alone - demanding
     * wss://raw.githubusercontent.com would reject a correctly configured
     * anchor, and a guard that fails on the right answer gets switched off.
     */
    const required = configuredEntries.flatMap((e) =>
      e.name === 'VITE_SUPABASE_URL'
        ? [e.origin, e.origin.replace(/^https:/, 'wss:')]
        : [e.origin],
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
        [...new Set(prodOrigins)].toSorted(),
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

    /*
     * THE ANCHOR HOST IS THE THIRD STATE, and collapsing it into either of the
     * other two makes this test lie.
     *
     * The deployed policy permits raw.githubusercontent.com because that is
     * where a published head is read from, while VITE_ANCHOR_URL is still
     * empty because no head is published yet and WHICH repository publishes it
     * is undecided - it has to sit outside admin control, so the choice is not
     * ours to guess.
     *
     * Asserting `configured.has(origin)` over that host would demand a
     * template nobody has agreed on, and the cheap way to go green is to
     * invent one - a plausible-looking repo path that resolves to nothing and
     * would be believed. Deleting the host from the policy instead is worse:
     * the anchor read then fails in production only, and a blocked anchor
     * reads on the verify screen as "no head published", which is exactly the
     * state a server suppressing the anchor would want to show.
     *
     * So this permits the anchor host while the anchor is unconfigured, and
     * asserts THE PAIR: the moment VITE_ANCHOR_URL is set it must point at a
     * host the policy already permits, and the exemption stops applying.
     */
    const anchorTemplate = (example.match(/^VITE_ANCHOR_URL=(.*)$/m)?.[1] ?? '')
      .trim()
      .replace(/^["']|["']$/g, '')
    const ANCHOR_HOST = 'https://raw.githubusercontent.com'

    for (const origin of prodOrigins) {
      if (origin === ANCHOR_HOST && anchorTemplate === '') {
        /*
         * Pinned as a pair so this branch cannot outlive its reason: if the
         * anchor is configured, the exemption is gone and the loop below
         * checks it like any other origin.
         */
        expect(
          anchorTemplate,
          'the anchor host is exempt only while no anchor is configured',
        ).toBe('')
        continue
      }
      expect(
        configured.has(origin),
        `${origin} is permitted in production but no VITE_*_URL in .env.example ` +
          `points at it. Either the app never fetches it, or the env drifted ` +
          `from the policy and the real fetch is blocked in production only.`,
      ).toBe(true)
    }

    /*
     * NOW THE OTHER DIRECTION, FOR EVERY ORIGIN - not just the anchor.
     *
     * The loop above walks the origins the POLICY names, so it can only catch
     * a policy that permits too much. An origin the environment configures and
     * the policy OMITS is invisible to it, and that is the direction that
     * breaks production: removing the Supabase origin from connect-src passed
     * all eight tests here, while the deployed app could not reach its own
     * database. Nothing throws locally - the dev server builds its list from
     * env and stays green - which is the silent block this file's header says
     * it exists to catch.
     *
     * An earlier version of this check covered only the anchor, because that
     * was the case in front of me. The asymmetry was the defect: a guard that
     * compares two lists has to compare them both ways.
     *
     * THIS IS THE SCHEME-EXACT CHECK, and it partly overlaps the earlier
     * "permits each origin the dev server derives" test, which accepts either
     * scheme. Dropping `https://...supabase.co` while `wss:` stays passes that
     * one and fails this one; removing the host entirely fails both. So
     * neither dies to a single mutant over a one-scheme policy, and that is
     * not a reason to delete either - the loose one answers "is the host
     * gone", this one answers "is the scheme the app actually uses permitted".
     * Verified by mutating both together.
     */
    for (const origin of required) {
      expect(
        prodOrigins,
        `${origin} is configured in .env.example but connect-src does not permit ` +
          `it. The dev server derives its own list from env and stays green, so ` +
          `the fetch is blocked in production ONLY - and a blocked Supabase ` +
          `read surfaces as an app that cannot load its data, with nothing in ` +
          `any local signal to explain it.`,
      ).toContain(origin)
    }

    /*
     * And the anchor's own pair, kept explicit because its failure mode is
     * the worst one in the product: a blocked anchor read surfaces on the
     * verify screen as "no head published", which is exactly what a server
     * suppressing the anchor would want a resident to see.
     */
    if (anchorTemplate !== '') {
      let anchorOrigin: string
      try {
        anchorOrigin = new URL(anchorTemplate.replace('{society}', 'x')).origin
      } catch {
        throw new Error(
          `VITE_ANCHOR_URL is set to ${anchorTemplate}, which is not an absolute URL. ` +
            `anchorUrl() returns null for it, so the verify screen reports no ` +
            `published head rather than a misconfiguration.`,
        )
      }
      expect(
        prodOrigins,
        `VITE_ANCHOR_URL points at ${anchorOrigin} but connect-src does not permit ` +
          `it. The anchor fetch is blocked in production only, and the verify ` +
          `screen then reads as "no head published" - indistinguishable from a ` +
          `server suppressing the anchor.`,
      ).toContain(anchorOrigin)
    }
  })
})

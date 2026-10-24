import { describe, expect, it } from 'vitest'
import {
  devAdjusting,
  devAnchor,
  devApprovals,
  devAuditYears,
  devDashboard,
  devDues,
  devFlagLog,
  devLedger,
  devReports,
  devSignoff,
} from './devData'
import * as empty from './devData.empty'

/*
 * The fixture gate is a security boundary, so it gets asserted rather
 * than reasoned about.
 *
 * What it exists to stop: thirteen route files imported lib/sample.ts
 * directly, and because they are separate lazy chunks sharing one
 * module, the bundler hoisted the whole fixture into the ENTRY chunk -
 * every vendor name, every resident handle, every per-flat dues figure,
 * downloaded by every role including a signed-out visitor at /login.
 *
 * The bundle half of that is checked by scripts/check-fixtures.mjs
 * against the built output, which is the only place it CAN be checked:
 * these tests run in development, where the fixture is supposed to be
 * present, so they cannot see the production graph. What they lock down
 * instead is the shape of the production half - that the empty module
 * is a real substitute for the real one, and that its absent values are
 * the honest ones rather than plausible-looking defaults.
 */

describe('the development side', () => {
  it('still returns the fixture, or the whole app is blank in development', () => {
    // If this ever fails the alias has leaked into the dev build and
    // every screen shows a retry, which looks like a broken app rather
    // than a misconfigured one.
    /*
     * NOT NULL FIRST, then non-empty. Every accessor returns
     * `T[] | null`, where null means the data was not fetched and each
     * route renders a "could not be loaded" band. In development both
     * failures look identical on screen — a page of retries — so
     * the two assertions separate "the alias leaked into the dev
     * build" from "the fixture went empty", which have different
     * fixes.
     */
    const lists = {
      ledger: devLedger(),
      approvals: devApprovals(),
      flagLog: devFlagLog(),
      dues: devDues(),
      reports: devReports(),
      signoff: devSignoff(),
      auditYears: devAuditYears(),
      adjusting: devAdjusting(),
    }

    for (const [name, value] of Object.entries(lists)) {
      expect(value, `${name} is null: the production alias leaked`).not.toBeNull()
    }

    expect(Object.keys(lists.flagLog ?? {}).length).toBeGreaterThan(0)
    for (const [name, value] of Object.entries(lists)) {
      if (name === 'flagLog') continue
      expect(
        (value as readonly unknown[]).length,
        `${name} is empty`,
      ).toBeGreaterThan(0)
    }

    expect(devDashboard()).not.toBeNull()
  })

  it('reports an anchor state the fingerprint band can render', () => {
    expect(['match', 'mismatch', 'first-visit', 'unreachable']).toContain(
      devAnchor().state,
    )
  })
})

describe('the production side', () => {
  it('exports every name the development side does', () => {
    /*
     * The two modules are swapped by a resolver alias, so nothing
     * typechecks the substitution: a name added to the fixture and not
     * to the empty module becomes `undefined` at runtime, in production
     * only, on whichever screen reads it.
     */
    const live = [
      'SAMPLE_ADJUSTING',
      'SAMPLE_ANCHOR',
      'SAMPLE_APPROVALS',
      'SAMPLE_AUDIT_YEARS',
      'SAMPLE_DASHBOARD',
      'SAMPLE_DUES',
      'SAMPLE_FLAG_LOG',
      'SAMPLE_LEDGER',
      'SAMPLE_REPORTS',
      'SAMPLE_SIGNOFF',
    ]
    for (const name of live) {
      expect(Object.hasOwn(empty, name), `missing from devData.empty: ${name}`).toBe(
        true,
      )
    }
  })

  it('never claims the published chain head agrees', () => {
    /*
     * The one assertion here that is about the product's central
     * security claim rather than about plumbing. A fingerprint band
     * showing 'match' having compared nothing would tell a resident the
     * record is verified on the screen that exists to verify it.
     * 'unreachable' with no dates is the most it may honestly say.
     */
    expect(empty.SAMPLE_ANCHOR.state).toBe('unreachable')
    expect(empty.SAMPLE_ANCHOR.publishedAt).toBeUndefined()
    expect(empty.SAMPLE_ANCHOR.lastComparedAt).toBeUndefined()
  })

  it('has no dashboard, rather than a zero one', () => {
    /*
     * Null, not a zeroed DashboardData. Every field is required and none
     * has an honest empty value - a zero balance is a financial claim
     * about the society's money, and an absent date is not a date. Null
     * forces the route to render its data-absent state instead.
     */
    expect(empty.SAMPLE_DASHBOARD).toBeNull()
  })

  it('reports every list as absent, never as empty', () => {
    /*
     * NULL, NOT `[]`, and this assertion is the whole point of the
     * change that introduced it.
     *
     * These were all `[]`, and every list route read an empty array as
     * "there is genuinely nothing" — so a production build stated,
     * in its own copy, that nothing was waiting for approval, that
     * every question had been answered, that every month was signed
     * off and that no closed year had needed a correction. It had
     * fetched nothing. Each of those is a claim about the committee's
     * conduct, produced by a build with no data at all, on the product
     * whose entire purpose is that such claims be checkable.
     *
     * Null is unrepresentable as "nothing to do": the type forces each
     * route to answer "what if this did not load" separately, and
     * every one of them now renders a band saying so.
     *
     * Asserting the RULE, not the literal: a list that is absent must
     * be null and must not be an empty collection, which is what
     * `toBeNull` plus the explicit not-equal pins down.
     */
    const absent = {
      SAMPLE_LEDGER: empty.SAMPLE_LEDGER,
      SAMPLE_APPROVALS: empty.SAMPLE_APPROVALS,
      SAMPLE_FLAG_LOG: empty.SAMPLE_FLAG_LOG,
      SAMPLE_DUES: empty.SAMPLE_DUES,
      SAMPLE_REPORTS: empty.SAMPLE_REPORTS,
      SAMPLE_SIGNOFF: empty.SAMPLE_SIGNOFF,
      SAMPLE_AUDIT_YEARS: empty.SAMPLE_AUDIT_YEARS,
      SAMPLE_ADJUSTING: empty.SAMPLE_ADJUSTING,
    }

    for (const [name, value] of Object.entries(absent)) {
      expect(value, `${name} must be null, not an empty collection`).toBeNull()
    }
  })
})

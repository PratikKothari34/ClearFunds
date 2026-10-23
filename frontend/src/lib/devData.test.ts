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
    expect(devLedger().length).toBeGreaterThan(0)
    expect(devApprovals().length).toBeGreaterThan(0)
    expect(Object.keys(devFlagLog()).length).toBeGreaterThan(0)
    expect(devDues().length).toBeGreaterThan(0)
    expect(devReports().length).toBeGreaterThan(0)
    expect(devSignoff().length).toBeGreaterThan(0)
    expect(devAuditYears().length).toBeGreaterThan(0)
    expect(devAdjusting().length).toBeGreaterThan(0)
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

  it('carries no invented records at all', () => {
    expect(empty.SAMPLE_LEDGER).toEqual([])
    expect(empty.SAMPLE_APPROVALS).toEqual([])
    expect(empty.SAMPLE_FLAG_LOG).toEqual({})
    expect(empty.SAMPLE_DUES).toEqual([])
    expect(empty.SAMPLE_REPORTS).toEqual([])
    expect(empty.SAMPLE_SIGNOFF).toEqual([])
    expect(empty.SAMPLE_AUDIT_YEARS).toEqual([])
    expect(empty.SAMPLE_ADJUSTING).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import {
  countsFor,
  openSignoffCount,
  pendingApprovalCount,
  unresolvedFlagCount,
} from './counts'
import { SAMPLE_APPROVALS, SAMPLE_FLAG_LOG, SAMPLE_SIGNOFF } from './sample'
import type { CountSources } from './counts'
import type { FlagLogItem, Role } from './types'

/*
 * These assert the RULES, not the sample numbers. An assertion that the
 * count equals 3 breaks every time a sample entry is added, teaches
 * nothing, and gets "fixed" by editing the expected number. The rules
 * below are the settled decisions, so a change to one of them should
 * fail here.
 *
 * The fixture is passed IN rather than imported by the module under
 * test, and that is the thing being locked down as much as any count:
 * counts.ts importing sample.ts put every flat's questions and dues in
 * the chunk each role downloads. A test that has to hand the data over
 * cannot stop noticing when the module starts reaching for it again.
 */

const ALL_ROLES: readonly Role[] = [
  'president',
  'treasurer',
  'secretary',
  'committee',
  'resident',
  'auditor',
]

const ALL_FLAGS = Object.values(SAMPLE_FLAG_LOG).flat()

const SOURCES: CountSources = {
  flags: ALL_FLAGS,
  approvals: SAMPLE_APPROVALS,
  signoff: SAMPLE_SIGNOFF,
}

describe('unresolvedFlagCount', () => {
  it('counts only flags with no resolvedAt', () => {
    const resolved = ALL_FLAGS.filter((f) => f.resolvedAt != null)

    expect(ALL_FLAGS.length, 'sample must contain flags at all').toBeGreaterThan(
      0,
    )
    expect(
      resolved.length,
      'sample must contain at least one RESOLVED flag, or this test cannot tell the difference',
    ).toBeGreaterThan(0)

    expect(unresolvedFlagCount(ALL_FLAGS)).toBe(
      ALL_FLAGS.length - resolved.length,
    )
  })

  it('is strictly less than the total number of flags ever raised', () => {
    // The settled rule: a resolved flag LEAVES the count and stays in
    // the log. If these were equal, the count would be "every question
    // ever asked", which grows forever and makes a committee that
    // answers everything still look negligent.
    expect(unresolvedFlagCount(ALL_FLAGS)).toBeLessThan(ALL_FLAGS.length)
  })

  it('treats a null resolvedAt as unresolved, not as answered', () => {
    /*
     * JSON has no `undefined`. A backend that serialises an open
     * question as "resolvedAt": null passes a `!== undefined` test, and
     * the question then reads as ANSWERED - the count drops, the
     * resident sees nothing waiting, and the one surface that exists to
     * show unanswered questions hides them. The check must be `!= null`.
     */
    const asJson = [
      { ...ALL_FLAGS[0]!, resolvedAt: null },
      { ...ALL_FLAGS[0]!, id: 'f-null-2', resolvedAt: null },
    ] as unknown as FlagLogItem[]
    expect(unresolvedFlagCount(asJson)).toBe(2)
  })
})

describe('pendingApprovalCount', () => {
  it('excludes entries this viewer has already approved', () => {
    const mine = SAMPLE_APPROVALS.filter((a) => a.viewerHasApproved)
    expect(
      mine.length,
      'sample must contain one the viewer already approved',
    ).toBeGreaterThan(0)

    expect(pendingApprovalCount(SAMPLE_APPROVALS)).toBe(
      SAMPLE_APPROVALS.length - mine.length,
    )
  })
})

describe('countsFor', () => {
  it('returns nothing at all when given no data', () => {
    /*
     * This is the production path. The fixture is development-only, so
     * a real build calls countsFor with no sources until the counts
     * endpoint exists. An empty map renders NO badge, which is correct;
     * a map of zeroes would render "0 items need you", which claims
     * nothing is waiting - a stronger statement than the app can make
     * before it has asked the server.
     */
    for (const role of ALL_ROLES) {
      expect(Object.keys(countsFor(role)), role).toEqual([])
    }
  })

  it('omits a figure whose source is absent rather than showing zero', () => {
    // Partial data is the normal case while endpoints land one at a
    // time. Each figure appears only if its own source arrived.
    const flagsOnly = countsFor('president', { flags: ALL_FLAGS })
    expect(flagsOnly['/disputes']).toBe(unresolvedFlagCount(ALL_FLAGS))
    expect(flagsOnly['/approvals']).toBeUndefined()
    expect(flagsOnly['/sign-off']).toBeUndefined()
  })

  it('gives every role the unresolved dispute figure', () => {
    // Residents raise disputes and must see the count; everyone else
    // has to act on it. No role is exempt.
    for (const role of ALL_ROLES) {
      expect(countsFor(role, SOURCES)['/disputes'], role).toBe(
        unresolvedFlagCount(ALL_FLAGS),
      )
    }
  })

  it('never offers an approvals count to a resident or an auditor', () => {
    // Neither approves anything. A badge for a surface they cannot act
    // on is noise, and computing it at all means the figure exists in
    // their payload.
    expect(countsFor('resident', SOURCES)['/approvals']).toBeUndefined()
    expect(countsFor('auditor', SOURCES)['/approvals']).toBeUndefined()
  })

  it('gives an approvals count to every role that approves', () => {
    for (const role of [
      'treasurer',
      'secretary',
      'president',
      'committee',
    ] as const) {
      expect(countsFor(role, SOURCES)['/approvals'], role).toBe(
        pendingApprovalCount(SAMPLE_APPROVALS),
      )
    }
  })

  it('offers sign-off only to the president', () => {
    // Final approval of the expense sheet is the president's job.
    expect(countsFor('president', SOURCES)['/sign-off']).toBe(
      openSignoffCount(SAMPLE_SIGNOFF),
    )
    for (const role of ALL_ROLES.filter((r) => r !== 'president')) {
      expect(countsFor(role, SOURCES)['/sign-off'], role).toBeUndefined()
    }
  })

  it('never returns a negative or fractional badge figure', () => {
    for (const role of ALL_ROLES) {
      for (const [route, n] of Object.entries(countsFor(role, SOURCES))) {
        expect(Number.isInteger(n), `${role} ${route}`).toBe(true)
        expect(n, `${role} ${route}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('only ever keys routes that exist in the navigation', () => {
    // A count keyed to a route no role can reach is a silent no-op.
    const known = new Set(['/disputes', '/approvals', '/sign-off'])
    for (const role of ALL_ROLES) {
      for (const route of Object.keys(countsFor(role, SOURCES))) {
        expect(known.has(route), `${role} -> ${route}`).toBe(true)
      }
    }
  })
})

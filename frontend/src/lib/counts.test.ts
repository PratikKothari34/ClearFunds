import { describe, expect, it } from 'vitest'
import {
  countsFor,
  openSignoffCount,
  pendingApprovalCount,
  unresolvedFlagCount,
} from './counts'
import { SAMPLE_APPROVALS, SAMPLE_FLAG_LOG } from './sample'
import type { Role } from './types'

/*
 * These assert the RULES, not the sample numbers. An assertion that the
 * count equals 3 breaks every time a sample entry is added, teaches
 * nothing, and gets "fixed" by editing the expected number. The rules
 * below are the settled decisions, so a change to one of them should
 * fail here.
 */

const ALL_ROLES: readonly Role[] = [
  'president',
  'treasurer',
  'secretary',
  'committee',
  'resident',
  'auditor',
]

describe('unresolvedFlagCount', () => {
  it('counts only flags with no resolvedAt', () => {
    const all = Object.values(SAMPLE_FLAG_LOG).flat()
    const resolved = all.filter((f) => f.resolvedAt !== undefined)

    expect(all.length, 'sample must contain flags at all').toBeGreaterThan(0)
    expect(
      resolved.length,
      'sample must contain at least one RESOLVED flag, or this test cannot tell the difference',
    ).toBeGreaterThan(0)

    expect(unresolvedFlagCount()).toBe(all.length - resolved.length)
  })

  it('is strictly less than the total number of flags ever raised', () => {
    const all = Object.values(SAMPLE_FLAG_LOG).flat()
    // The settled rule: a resolved flag LEAVES the count and stays in
    // the log. If these were equal, the count would be "every question
    // ever asked", which grows forever and makes a committee that
    // answers everything still look negligent.
    expect(unresolvedFlagCount()).toBeLessThan(all.length)
  })
})

describe('pendingApprovalCount', () => {
  it('excludes entries this viewer has already approved', () => {
    const mine = SAMPLE_APPROVALS.filter((a) => a.viewerHasApproved)
    expect(
      mine.length,
      'sample must contain one the viewer already approved',
    ).toBeGreaterThan(0)

    expect(pendingApprovalCount()).toBe(SAMPLE_APPROVALS.length - mine.length)
  })
})

describe('countsFor', () => {
  it('gives every role the unresolved dispute figure', () => {
    // Residents raise disputes and must see the count; everyone else
    // has to act on it. No role is exempt.
    for (const role of ALL_ROLES) {
      expect(countsFor(role)['/disputes'], role).toBe(unresolvedFlagCount())
    }
  })

  it('never offers an approvals count to a resident or an auditor', () => {
    // Neither approves anything. A badge for a surface they cannot act
    // on is noise, and computing it at all means the figure exists in
    // their payload.
    expect(countsFor('resident')['/approvals']).toBeUndefined()
    expect(countsFor('auditor')['/approvals']).toBeUndefined()
  })

  it('gives an approvals count to every role that approves', () => {
    for (const role of ['treasurer', 'secretary', 'president', 'committee'] as const) {
      expect(countsFor(role)['/approvals'], role).toBe(pendingApprovalCount())
    }
  })

  it('offers sign-off only to the president', () => {
    // Final approval of the expense sheet is the president's job.
    expect(countsFor('president')['/sign-off']).toBe(openSignoffCount())
    for (const role of ALL_ROLES.filter((r) => r !== 'president')) {
      expect(countsFor(role)['/sign-off'], role).toBeUndefined()
    }
  })

  it('never returns a negative or fractional badge figure', () => {
    for (const role of ALL_ROLES) {
      for (const [route, n] of Object.entries(countsFor(role))) {
        expect(Number.isInteger(n), `${role} ${route}`).toBe(true)
        expect(n, `${role} ${route}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('only ever keys routes that exist in the navigation', () => {
    // A count keyed to a route no role can reach is a silent no-op.
    const known = new Set(['/disputes', '/approvals', '/sign-off'])
    for (const role of ALL_ROLES) {
      for (const route of Object.keys(countsFor(role))) {
        expect(known.has(route), `${role} -> ${route}`).toBe(true)
      }
    }
  })
})

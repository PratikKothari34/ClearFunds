/*
 * WHO IS WAITING, AND ON WHICH MONTHS.
 *
 * Both functions decided something and lived in components/Shell.tsx, where
 * nothing could reach them without mounting a router - so nothing did. They
 * gate the Approve and Decline buttons, the approvals badge, the dashboard's
 * waiting list, the president's sign-off badge on every page load, and the
 * twelve rows of the sign-off screen.
 *
 * The state list is read out of PROPOSAL_STATES rather than written here, so
 * a seventh proposal state fails this suite instead of silently deciding
 * whether a vote is still open.
 */
import { describe, expect, it } from 'vitest'
import { recentMonths, waitsOn } from './pending'
import { PROPOSAL_STATES } from './types'
import { todayIST } from './format'
import type { Me, ProposalRow } from './types'

type Role = 'president' | 'treasurer' | 'secretary' | 'member'
const ROLES: Role[] = ['president', 'treasurer', 'secretary', 'member']

const me = (role: Role | null): Me =>
  ({
    person: 'me', society: 's', tenure: null, auditor_for: [], last_seen: null,
    seat: role ? { person: 'me', role } : null,
  }) as unknown as Me

const base = {
  seq: 1, state: 'open', tier: 'committee', approvals: [], proposed_by: 'other',
  approve_count: 0, decline_count: 0, required: 2,
}
const p = (over: Record<string, unknown> = {}) => ({ ...base, ...over }) as unknown as ProposalRow

const votes = (...people: string[]) =>
  people.map((person) => ({ person, decision: 'approve' }))

describe('waitsOn', () => {
  it('waits on every committee member for an open committee-tier proposal', () => {
    for (const role of ROLES) expect(waitsOn(p(), me(role)), role).toBe(true)
  })

  it('never waits on someone with no committee seat', () => {
    // A resident cannot sign, at either tier. The tier never widens to a
    // non-admin, whatever the amount.
    expect(waitsOn(p(), me(null))).toBe(false)
    expect(waitsOn(p({ tier: 'pair' }), me(null))).toBe(false)
  })

  it('waits only on the treasurer and the secretary below the limit', () => {
    /* 0004's tier: at or below the committee-set limit it is those two and
     * both of them - never one of them, and never a third officer instead. */
    const pair = p({ tier: 'pair' })
    expect(waitsOn(pair, me('treasurer'))).toBe(true)
    expect(waitsOn(pair, me('secretary'))).toBe(true)
    expect(waitsOn(pair, me('president'))).toBe(false)
    expect(waitsOn(pair, me('member'))).toBe(false)
  })

  it('stops waiting once this person has cast a vote, either way', () => {
    for (const decision of ['approve', 'decline']) {
      const voted = p({ approvals: [{ person: 'me', decision }] })
      expect(waitsOn(voted, me('treasurer')), decision).toBe(false)
      expect(waitsOn(voted, me('member')), decision).toBe(false)
    }
  })

  it('still waits when the votes cast so far are other people', () => {
    expect(waitsOn(p({ approvals: votes('a', 'b', 'c') }), me('treasurer'))).toBe(true)
  })

  it('finds this person among several voters, not only as the first', () => {
    expect(waitsOn(p({ approvals: votes('a', 'b', 'me') }), me('treasurer'))).toBe(false)
  })

  it('waits on no state but open, across the whole contract list', () => {
    /* The flat_set defect in this shape: a state added to cf.proposal_status
     * must read as closed, not fall through to a live Approve button on a
     * proposal that is already decided. */
    for (const state of PROPOSAL_STATES) {
      const want = state === 'open'
      expect(waitsOn(p({ state }), me('treasurer')), state).toBe(want)
      expect(waitsOn(p({ state, tier: 'pair' }), me('secretary')), state).toBe(want)
      expect(waitsOn(p({ state }), me('member')), state).toBe(want)
    }
  })

  it('treats a state this build has never heard of as closed', () => {
    expect(waitsOn(p({ state: 'cf_a_state_from_the_future' }), me('treasurer'))).toBe(false)
  })

  it('has exactly one open state to find', () => {
    // Vacuity guard. If PROPOSAL_STATES lost `open`, the loop above would
    // assert false for every state and pass while proving nothing.
    expect(PROPOSAL_STATES.filter((s) => s === 'open')).toHaveLength(1)
    expect(PROPOSAL_STATES.length).toBeGreaterThan(1)
  })
})

describe('recentMonths', () => {
  it('returns the month asked for first, then backwards', () => {
    expect(recentMonths('2026-11', 3)).toEqual(['2026-11', '2026-10', '2026-09'])
  })

  it('rolls back into the previous year without a special case', () => {
    expect(recentMonths('2026-01', 3)).toEqual(['2026-01', '2025-12', '2025-11'])
    expect(recentMonths('2026-02', 12).at(-1)).toBe('2025-03')
  })

  it('returns n months, strictly descending, every one well-formed', () => {
    /* The rule, not a sample list: length, order and shape hold for every
     * starting month and both windows the screens ask for. */
    for (const start of ['2026-01', '2026-02', '2026-07', '2026-12']) {
      for (const n of [1, 3, 12]) {
        const out = recentMonths(start, n)
        expect(out, `${start} x${n}`).toHaveLength(n)
        expect(out[0], `${start} x${n}`).toBe(start)
        for (const m of out) expect(m).toMatch(/^\d{4}-\d{2}$/)
        for (let i = 1; i < out.length; i++) {
          expect(out[i]! < out[i - 1]!, `${out[i]} after ${out[i - 1]}`).toBe(true)
        }
      }
    }
  })

  it('never names a month after the one it was given', () => {
    for (const m of recentMonths('2026-03', 12)) expect(m <= '2026-03').toBe(true)
  })

  it('refuses a malformed month rather than throwing during render', () => {
    /* toISOString() on an Invalid Date is a RangeError, and this runs inside
     * the nav badge on every page load, with no error boundary in the tree -
     * so the whole app blanks, not one badge. */
    for (const bad of ['', 'nope', '2026', '2026-', 'YYYY-MM', '2026-13', '2026-00', 'x026-01', '20261-1']) {
      expect(() => recentMonths(bad, 3), bad).not.toThrow()
      expect(recentMonths(bad, 3), bad).toEqual([])
    }
  })

  it('refuses a window that is not a positive whole number', () => {
    for (const n of [0, -1, 1.5, Number.NaN]) {
      expect(recentMonths('2026-05', n), String(n)).toEqual([])
    }
  })

  it('accepts the full date todayIST actually produces', () => {
    /* The over-tightening guard, and the reason it matters: both callers pass
     * todayIST().slice(0, 7), but an empty list from a regex that is too
     * strict looks exactly like a president with nothing left to sign. */
    const today = todayIST()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(recentMonths(today.slice(0, 7), 3)).toHaveLength(3)
    expect(recentMonths(today, 3)).toHaveLength(3)
  })
})

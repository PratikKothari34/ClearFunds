/**
 * "No auditor appointed yet" is a claim about this society's statutory
 * position. It may only be reached once the read has actually succeeded.
 *
 * The defect: `/committee` rendered that sentence from
 * `!(years.data ?? []).some(...)`. `years.data` is `undefined` both while the
 * read is in flight and when it has failed, so a society that HAD appointed
 * its auditor read as one that had not - on the screen whose job is to say
 * who holds which office. The route's only error arm covers a different
 * query, and this card sits outside it.
 *
 * Tests the function that DECIDES, not the card that reports: the computation
 * is the guard. The route's per-state rendering is pinned separately in
 * `settled.sweep.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { auditorPresence, named } from './auditors'
import type { Year } from './types'

const year = (y: Partial<Year>): Year => ({
  fy: '2026-27', starts: '2026-04-01', ends: '2027-03-31',
  ended: false, closed: false, headline: null, headline_seq: null,
  history: [], auditor: [],
  ...y,
})

const WITH = year({ fy: '2025-26', auditor: [{ name: 'CA Meera Kulkarni', appointment_seq: 9 }] })
const WITHOUT = year({ fy: '2026-27', auditor: [] })
const UNREPORTED = year({ fy: '2024-25', auditor: null })

const pending = { data: undefined, isPending: true, isError: false }
const failed = { data: undefined, isPending: false, isError: true }
const ok = (data: readonly Year[]) => ({ data, isPending: false, isError: false })

describe('auditorPresence', () => {
  it('does NOT claim there is no auditor when the read failed', () => {
    // THE DEFECT.
    expect(auditorPresence(failed).kind).not.toBe('none')
  })

  it('does NOT claim there is no auditor while the read is in flight', () => {
    expect(auditorPresence(pending).kind).not.toBe('none')
  })

  it('does not report rows still being refetched as the current answer', () => {
    // `isPending` with rows ALREADY IN HAND: a background refetch keeps the
    // last successful list. Every other pending fixture here has `data:
    // undefined`, so dropping the `isPending` check and keeping only the
    // `data === undefined` one passed all of them - the flag was untested and
    // a stale list would have been presented as what is appointed now.
    expect(auditorPresence({ data: [WITH], isPending: true, isError: false }).kind).toBe('pending')
    expect(auditorPresence({ data: [WITHOUT], isPending: true, isError: false }).kind).toBe('pending')
  })

  it('tells a failed read apart from one still arriving', () => {
    // One screen offers nothing to do; the other is still working. Collapsing
    // them leaves a skeleton that never resolves, or a claim from no data.
    expect(auditorPresence(failed).kind).not.toBe(auditorPresence(pending).kind)
  })

  it('reports an appointment that arrived', () => {
    const s = auditorPresence(ok([WITH, WITHOUT]))
    expect(s.kind).toBe('some')
    expect(s.kind === 'some' && s.years.map((y) => y.fy)).toEqual(['2025-26'])
  })

  it('says none only when every year reported its appointments and had none', () => {
    // An empty list that actually ARRIVED is a real answer, and the screen
    // should say so plainly.
    expect(auditorPresence(ok([WITHOUT])).kind).toBe('none')
  })

  it('treats a null auditor field as the server declining to answer, not an absence', () => {
    // `Year.auditor` is `[] | null`. Counting null towards "none" is the
    // `?? []` bug one layer in: no appointment was reported, which is not the
    // same as no appointment existing.
    expect(auditorPresence(ok([UNREPORTED])).kind).toBe('unknown')
  })

  it('still reports an appointment it can see beside a year that reported nothing', () => {
    // The unknown only governs the NEGATIVE claim. A name in hand is a name
    // in hand, so refusing to show it would lose real information.
    const s = auditorPresence(ok([UNREPORTED, WITH]))
    expect(s.kind).toBe('some')
    expect(s.kind === 'some' && s.years.map((y) => y.fy)).toEqual(['2025-26'])
  })

  it('refuses rows held from a read that has since failed', () => {
    // isError WITH data in hand: a failed background refetch keeps the last
    // successful rows. Reporting them presents a stale answer as a current
    // one, so error is checked before the data is looked at.
    expect(auditorPresence({ data: [WITH], isPending: false, isError: true }).kind).toBe('unknown')
  })

  it('claims nothing from stale rows even when they say there is no auditor', () => {
    expect(auditorPresence({ data: [WITHOUT], isPending: false, isError: true }).kind).toBe('unknown')
  })

  it('does not resolve to an answer when both query flags are set', () => {
    const s = auditorPresence({ data: undefined, isPending: true, isError: true })
    expect(s.kind === 'some' || s.kind === 'none').toBe(false)
  })

  it('an empty year list that arrived reports none, not unknown', () => {
    // A society with no financial years yet has no appointments, and that is
    // a real answer rather than a failure to read one.
    expect(auditorPresence(ok([])).kind).toBe('none')
  })

  it('carries no years field in any state that is not an answer', () => {
    // Reading `.years` off a refusing state would yield undefined and then an
    // empty render - the same silence the fix exists to remove.
    for (const q of [pending, failed, ok([UNREPORTED])]) {
      expect('years' in auditorPresence(q)).toBe(false)
    }
  })

  it('reaches all four states, so none of the above is vacuous', () => {
    const states = [
      auditorPresence(ok([WITH])).kind,
      auditorPresence(ok([WITHOUT])).kind,
      auditorPresence(pending).kind,
      auditorPresence(failed).kind,
    ]
    expect([...states].sort()).toEqual(['none', 'pending', 'some', 'unknown'])
  })
})

describe('named', () => {
  it('separates an appointment from both ways of having none', () => {
    expect(named(WITH)).toBe(true)
    expect(named(WITHOUT)).toBe(false)
    expect(named(UNREPORTED)).toBe(false)
  })

  it('does not read a null auditor field as an appointment', () => {
    // `y.auditor?.length` is `undefined` here, which is falsy and happened to
    // behave - but the presence decision must not depend on that coincidence.
    expect(named(year({ auditor: null }))).toBe(false)
  })
})

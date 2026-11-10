import { describe, expect, it } from 'vitest'
import { disputeState } from './disputed'
import type { DisputeRow, LedgerRow } from './types'

/*
 * `disputeState` is what decides whether a missing dispute flag on the ledger
 * means "this entry is not disputed" or "we could not check".
 *
 * The defect it exists to prevent: the route read `disputes.data` alone.
 * `useDisputes()` is a plain `useQuery`, so `.data` is `undefined` while
 * pending AND on error, and `disputedBy(undefined)` returns a predicate that
 * honestly claims nothing. The route then presented "claims nothing" as
 * "nothing is disputed" - the Disputed filter rendered "No entries match",
 * and every row elsewhere rendered unflagged.
 *
 * So these cases are about the THREE-WAY answer, not about matching. The
 * matching rule is `disputedBy`, covered in disputed.test.ts. Nothing here
 * asserts a count.
 */
const dispute = (d: Partial<DisputeRow>): DisputeRow => ({
  seq: 1, recorded_at: 1, handle: 'h', scope: 'entries', target_seqs: [],
  counterparty: null, period: null, text: 't', is_open: true, notes: [],
  ...d,
})

const row = (r: Partial<LedgerRow>): LedgerRow => ({ seq: 1, counterparty: null, ...r } as LedgerRow)

/** The three shapes a TanStack query presents, named as the screens see them. */
const pending = { data: undefined, isPending: true, isError: false }
const failed = { data: undefined, isPending: false, isError: true }

describe('disputeState', () => {
  it('never reports a failed read as an answer', () => {
    expect(disputeState(failed).kind).toBe('unknown')
  })

  it('never reports a pending read as an answer', () => {
    expect(disputeState(pending).kind).toBe('pending')
  })

  it('distinguishes a failure from a load in progress', () => {
    // Both are "cannot answer", and a surface says different things about
    // them: one resolves itself, the other does not. Collapsing them into a
    // single not-ready value is what makes a dead read look like a slow one.
    expect(disputeState(failed).kind).not.toBe(disputeState(pending).kind)
  })

  it('reports an empty list that actually arrived as a real answer', () => {
    // THE CASE THE WHOLE THREE-WAY SPLIT TURNS ON. "No disputes" is a true
    // and useful statement; the bug was never that an empty list is wrong,
    // only that an UNREADABLE list rendered the same way.
    expect(disputeState({ data: [], isPending: false, isError: false }).kind).toBe('ready')
  })

  it('reports a list with rows as a real answer', () => {
    expect(disputeState({ data: [dispute({ target_seqs: [1] })], isPending: false, isError: false }).kind).toBe('ready')
  })

  it('treats a successful read with no data as not-yet-answered, never as ready', () => {
    // Belt and braces for a query shape that reports neither pending nor
    // error while still holding nothing. `ready` here would hand a caller a
    // predicate that claims nothing and a label saying it is the answer.
    expect(disputeState({ data: undefined, isPending: false, isError: false }).kind).toBe('pending')
  })

  it('refuses rows it is holding from a read that has since failed', () => {
    /*
     * TanStack keeps the last successful `data` across a failed background
     * refetch, so `isError` can arrive WITH rows in hand. Reporting those as
     * `ready` presents a stale answer as a current one, on the one surface
     * where a missing flag is a false statement about money. Error is checked
     * first, and this is the case that proves the order.
     */
    const q = { data: [dispute({ target_seqs: [1] })], isPending: false, isError: true }
    expect(disputeState(q).kind).toBe('unknown')
  })

  it('claims nothing from stale rows it is refusing', () => {
    // The state is not the only thing that must not leak: a caller that
    // ignores `kind` and uses `is` must not be flagged from data this
    // function has already declared unusable.
    const q = { data: [dispute({ target_seqs: [7] })], isPending: false, isError: true }
    expect(disputeState(q).is(row({ seq: 7 }))).toBe(false)
  })

  it('carries a predicate in every state, so a caller that forgets to branch is no worse off', () => {
    for (const q of [pending, failed, { data: [], isPending: false, isError: false }]) {
      expect(typeof disputeState(q).is, JSON.stringify(q)).toBe('function')
      expect(disputeState(q).is(row({ seq: 1 })), JSON.stringify(q)).toBe(false)
    }
  })

  it('applies the real matching rule once the read is ready', () => {
    // Not a second copy of disputed.test.ts - this asserts that the ready
    // arm delegates rather than reimplementing, including the payee half a
    // reimplementation drops.
    const s = disputeState({
      data: [dispute({ scope: 'counterparty', counterparty: 'Sharma Plumbing' })],
      isPending: false,
      isError: false,
    })
    expect(s.kind).toBe('ready')
    expect(s.is(row({ seq: 99, counterparty: 'sharma plumbing' }))).toBe(true)
    expect(s.is(row({ seq: 99, counterparty: 'Someone Else' }))).toBe(false)
  })

  it('does not let a closed dispute flag anything once ready', () => {
    const s = disputeState({
      data: [dispute({ target_seqs: [4], is_open: false })],
      isPending: false,
      isError: false,
    })
    expect(s.is(row({ seq: 4 }))).toBe(false)
  })

  it('answers the same way whichever not-ready flag is set, never silently preferring data', () => {
    // A query that is both pending and errored must not resolve to `ready`
    // by some precedence accident.
    expect(disputeState({ data: undefined, isPending: true, isError: true }).kind).not.toBe('ready')
    expect(disputeState({ data: [dispute({})], isPending: true, isError: true }).kind).not.toBe('ready')
  })

  it('is exhaustive: every query shape resolves to one of the three states', () => {
    const states = new Set<string>()
    for (const data of [undefined, [], [dispute({ target_seqs: [1] })]]) {
      for (const isPending of [true, false]) {
        for (const isError of [true, false]) {
          const k = disputeState({ data, isPending, isError }).kind
          expect(['ready', 'pending', 'unknown'], `${String(data?.length)}/${isPending}/${isError}`).toContain(k)
          states.add(k)
        }
      }
    }
    // And all three are genuinely reachable - a function that only ever
    // returned 'unknown' would pass every assertion above this one.
    expect([...states].sort()).toEqual(['pending', 'ready', 'unknown'])
  })
})

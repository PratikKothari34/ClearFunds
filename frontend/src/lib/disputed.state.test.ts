import { describe, expect, it } from 'vitest'
import { disputeState, entryDisputes } from './disputed'
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

/*
 * The same question on ONE entry, where the rows are the answer.
 *
 * The entry screen had the identical defect in a worse place: `(disputes.data
 * ?? []).filter(...)` yielded nothing on a failed read, and the section was
 * rendered behind `flagged.length > 0`, so it disappeared. That is the screen
 * a resident opens in order to read the dispute.
 *
 * It also kept its own copy of the matching rule. These cases pin the rule as
 * the ledger's - entry AND payee - and pin the one place the two deliberately
 * differ: `is_open` is not filtered, because the section shows the
 * append-only log while only the chip counts the open ones.
 */
describe('entryDisputes', () => {
  const ENTRY = row({ seq: 7, counterparty: 'Sharma Plumbing' })

  it('never reports a failed read as "no disputes on this entry"', () => {
    // THE DEFECT. `?? []` made this case identical to a clean entry, and the
    // section was hidden on an empty list.
    expect(entryDisputes(failed, ENTRY).kind).toBe('unknown')
  })

  it('never reports a pending read as an answer', () => {
    expect(entryDisputes(pending, ENTRY).kind).toBe('pending')
  })

  it('distinguishes a failure from a load in progress', () => {
    expect(entryDisputes(failed, ENTRY).kind).not.toBe(entryDisputes(pending, ENTRY).kind)
  })

  it('reports a readable list with nothing against this entry as a real answer', () => {
    const s = entryDisputes({ data: [dispute({ target_seqs: [999] })], isPending: false, isError: false }, ENTRY)
    expect(s.kind).toBe('ready')
    expect(s.kind === 'ready' && s.rows).toEqual([])
  })

  it('finds a dispute that names the entry by sequence', () => {
    const d = dispute({ target_seqs: [7] })
    const s = entryDisputes({ data: [d], isPending: false, isError: false }, ENTRY)
    expect(s.kind === 'ready' && s.rows).toEqual([d])
  })

  it('finds a dispute that names the payee, not only the cited entries', () => {
    // The half a reimplementation drops, and the reason the rule lives in
    // one place: a resident disputing a payee is disputing every entry to
    // them.
    const d = dispute({ scope: 'counterparty', counterparty: 'sharma plumbing', target_seqs: [] })
    const s = entryDisputes({ data: [d], isPending: false, isError: false }, ENTRY)
    expect(s.kind === 'ready' && s.rows).toEqual([d])
  })

  it('does not match a payee dispute against an entry with no payee', () => {
    const d = dispute({ scope: 'counterparty', counterparty: 'Sharma Plumbing' })
    const s = entryDisputes({ data: [d], isPending: false, isError: false }, row({ seq: 7, counterparty: null }))
    expect(s.kind === 'ready' && s.rows).toEqual([])
  })

  it('does not join two ABSENT payees to each other', () => {
    /*
     * `d.counterparty?.toLowerCase() === payee` reads as the same rule and is
     * not: with no payee on either side it compares `undefined === undefined`
     * and returns TRUE, so every payee-less dispute would attach itself to
     * every payee-less entry - a dispute about one thing displayed on an
     * unrelated one. Both sides are therefore required to be present, not
     * merely equal.
     *
     * The case above cannot catch this: it gives the dispute a payee, where
     * the two readings agree.
     */
    const d = dispute({ seq: 50, target_seqs: [999], counterparty: null })
    const s = entryDisputes({ data: [d], isPending: false, isError: false }, row({ seq: 7, counterparty: null }))
    expect(s.kind === 'ready' && s.rows).toEqual([])
  })

  it('still matches by sequence when neither side has a payee', () => {
    // And the guard above must not cost the sequence half of the rule.
    const d = dispute({ seq: 51, target_seqs: [7], counterparty: null })
    const s = entryDisputes({ data: [d], isPending: false, isError: false }, row({ seq: 7, counterparty: null }))
    expect(s.kind === 'ready' && s.rows).toEqual([d])
  })

  it('does not treat an empty-string payee as a payee', () => {
    // `'' === ''` is true and `!!''` is false. The empty string is absence
    // typed into a text field, not a payee two entries share.
    const d = dispute({ seq: 52, target_seqs: [999], counterparty: '' })
    const s = entryDisputes({ data: [d], isPending: false, isError: false }, row({ seq: 7, counterparty: '' }))
    expect(s.kind === 'ready' && s.rows).toEqual([])
  })

  it('KEEPS resolved disputes, because the section is a log and not a count', () => {
    /*
     * The one place this deliberately differs from the ledger predicate.
     * `disputedBy` ignores closed disputes - it drives a to-do filter - but
     * dropping them here would delete part of an append-only record from the
     * only screen that displays it. A resolved dispute naming a PAYEE cannot
     * be reached through the predicate at all, which is why this matches
     * directly rather than filtering through it.
     */
    const open = dispute({ seq: 1, target_seqs: [7], is_open: true })
    const closed = dispute({ seq: 2, target_seqs: [7], is_open: false })
    const closedPayee = dispute({ seq: 3, scope: 'counterparty', counterparty: 'Sharma Plumbing', is_open: false })
    const s = entryDisputes({ data: [open, closed, closedPayee], isPending: false, isError: false }, ENTRY)
    expect(s.kind === 'ready' && s.rows.map((d) => d.seq)).toEqual([1, 2, 3])
  })

  it('matches a payee case-insensitively on both sides', () => {
    const d = dispute({ scope: 'counterparty', counterparty: 'SHARMA PLUMBING' })
    const s = entryDisputes({ data: [d], isPending: false, isError: false }, row({ seq: 7, counterparty: 'sharma plumbing' }))
    expect(s.kind === 'ready' && s.rows).toEqual([d])
  })

  it('refuses rows it is holding from a read that has since failed', () => {
    const q = { data: [dispute({ target_seqs: [7] })], isPending: false, isError: true }
    expect(entryDisputes(q, ENTRY).kind).toBe('unknown')
  })

  it('carries no rows in any state it refuses to answer', () => {
    // The type makes this structural rather than a convention: there is no
    // `rows` to misread outside the ready arm.
    for (const q of [pending, failed, { data: [dispute({ target_seqs: [7] })], isPending: false, isError: true }]) {
      const s = entryDisputes(q, ENTRY)
      expect(s.kind, JSON.stringify(q)).not.toBe('ready')
      expect('rows' in s, JSON.stringify(q)).toBe(false)
    }
  })

  it('is exhaustive: every query shape resolves to one of the three states', () => {
    const states = new Set<string>()
    for (const data of [undefined, [], [dispute({ target_seqs: [7] })]]) {
      for (const isPending of [true, false]) {
        for (const isError of [true, false]) {
          states.add(entryDisputes({ data, isPending, isError }, ENTRY).kind)
        }
      }
    }
    expect([...states].sort()).toEqual(['pending', 'ready', 'unknown'])
  })
})

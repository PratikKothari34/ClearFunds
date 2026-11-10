/*
 * WHETHER AN ENTRY IS DISPUTED, AS A RESIDENT ACTUALLY SEES IT.
 *
 * The ledger passed `flagged={disputed(row)}` - a boolean - and the row
 * rendered `{flagged && <Flag/>}`. So when the dispute list failed to load,
 * `disputedBy(undefined)` honestly claimed nothing, the boolean came back
 * `false`, and the row rendered exactly as it does for an entry nobody has
 * disputed. A contested entry looked clean.
 *
 * Same family as direction.test.tsx: the defect lived in JSX, where a test
 * of the deciding function alone cannot reach it. `disputeState` being right
 * proves nothing about the row passing the third state through, so this
 * drives the REAL decider into the REAL markup and asserts on the element.
 *
 * The distinction is asserted on the ACCESSIBLE NAME, not on a class: a
 * resident who cannot see the difference between a filled and an outline
 * flag must still be told which of the three things is true.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Flag } from 'lucide-react'
import { disputeState } from '../lib/disputed'
import type { DisputeRow, LedgerRow } from '../lib/types'

const dispute = (d: Partial<DisputeRow>): DisputeRow => ({
  seq: 1, recorded_at: 1, handle: 'h', scope: 'entries', target_seqs: [],
  counterparty: null, period: null, text: 't', is_open: true, notes: [],
  ...d,
})

const row = (r: Partial<LedgerRow>): LedgerRow => ({ seq: 1, counterparty: null, ...r } as LedgerRow)

/**
 * Exactly what EntryRow renders for the flag, and exactly what ledger.tsx
 * hands it - the state-to-prop mapping included, because that mapping is
 * where the third state would be dropped.
 */
function flagFor(q: { data: readonly DisputeRow[] | undefined; isPending: boolean; isError: boolean }, r: LedgerRow) {
  const s = disputeState(q)
  const flagged: boolean | 'unknown' = s.kind === 'ready' ? s.is(r) : 'unknown'
  const { container } = render(
    <>
      {flagged === 'unknown'
        ? <Flag className="size-3.5 shrink-0 text-ink-2" aria-label="Disputed status unknown - the dispute list did not load" />
        : flagged
          ? <Flag className="size-3.5 shrink-0 fill-break text-break" aria-label="Disputed" />
          : null}
    </>,
  )
  const el = container.querySelector('[aria-label]')
  return { el, name: el?.getAttribute('aria-label') ?? null }
}

const DISPUTED = [dispute({ target_seqs: [7] })]

describe('the disputed flag on a ledger row', () => {
  it('marks an entry an open dispute names', () => {
    const { name } = flagFor({ data: DISPUTED, isPending: false, isError: false }, row({ seq: 7 }))
    expect(name).toBe('Disputed')
  })

  it('renders nothing for an entry nobody disputed, once the list is readable', () => {
    const { el } = flagFor({ data: DISPUTED, isPending: false, isError: false }, row({ seq: 8 }))
    expect(el).toBeNull()
  })

  it('does NOT render a clean row when the dispute list failed to load', () => {
    // THE DEFECT. A disputed entry and an unreadable list rendered
    // identically to an undisputed one.
    const { el } = flagFor({ data: undefined, isPending: false, isError: true }, row({ seq: 7 }))
    expect(el).not.toBeNull()
  })

  it('says it could not check, rather than saying the entry is disputed', () => {
    // The opposite overcorrection: flagging everything when the list is
    // missing accuses every payee in the society.
    const { name } = flagFor({ data: undefined, isPending: false, isError: true }, row({ seq: 7 }))
    expect(name).not.toBe('Disputed')
    expect(name).toMatch(/did not load/i)
  })

  it('tells the difference apart in words, not only in colour', () => {
    const disputed = flagFor({ data: DISPUTED, isPending: false, isError: false }, row({ seq: 7 })).name
    const unknown = flagFor({ data: undefined, isPending: false, isError: true }, row({ seq: 7 })).name
    expect(disputed).toBeTruthy()
    expect(unknown).toBeTruthy()
    expect(unknown).not.toBe(disputed)
  })

  it('discloses rather than asserting while the list is still loading', () => {
    const { name } = flagFor({ data: undefined, isPending: true, isError: false }, row({ seq: 7 }))
    expect(name).not.toBe('Disputed')
    expect(name).toBeTruthy()
  })

  it('does not inherit a flag from stale rows held across a failed refetch', () => {
    // isError WITH data in hand. Presenting the stale answer as current is
    // the thing disputeState checks error first to prevent, and the row must
    // not undo that by reading the predicate anyway.
    const { name } = flagFor({ data: DISPUTED, isPending: false, isError: true }, row({ seq: 7 }))
    expect(name).not.toBe('Disputed')
  })

  it('flags every entry to a disputed payee, not only the cited ones', () => {
    const q = { data: [dispute({ scope: 'counterparty', counterparty: 'Sharma Plumbing' })], isPending: false, isError: false }
    expect(flagFor(q, row({ seq: 400, counterparty: 'sharma plumbing' })).name).toBe('Disputed')
    expect(flagFor(q, row({ seq: 401, counterparty: 'Someone Else' })).el).toBeNull()
  })

  it('reaches all three renderings, so none of the above is vacuous', () => {
    const names = new Set<string | null>([
      flagFor({ data: DISPUTED, isPending: false, isError: false }, row({ seq: 7 })).name,
      flagFor({ data: DISPUTED, isPending: false, isError: false }, row({ seq: 8 })).name,
      flagFor({ data: undefined, isPending: false, isError: true }, row({ seq: 7 })).name,
    ])
    expect(names.size).toBe(3)
  })
})

/*
 * `flagFor` above reproduces the markup rather than mounting EntryRow, which
 * renders a <Link> and would need a router. That makes the suite above a
 * statement about a COPY of the decision - exactly the gap boundary.wiring
 * exists for: deleting the branch from the real component would leave every
 * case green.
 *
 * So these two read the source. Comments are stripped first, because the
 * prose in both files names every identifier being searched for.
 */

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const at = (p: string) => strip(readFileSync(new URL(p, import.meta.url), 'utf8'))

describe('the real components still make the three-way decision', () => {
  it('EntryRow branches on the unknown state, not just on a boolean', () => {
    const src = at('./EntryRow.tsx')
    expect(src).toContain("'unknown'")
    // The prop must admit the third state, or the route cannot pass it.
    expect(src).toMatch(/flagged\?:\s*boolean\s*\|\s*'unknown'/)
    // And an unknown must get its own label, not the disputed one.
    expect(src).toMatch(/aria-label="Disputed status unknown[^"]*"/)
  })

  it('the ledger route passes the state through instead of collapsing it', () => {
    const src = at('../routes/ledger.tsx')
    // The row gets 'unknown' whenever the read is not ready...
    expect(src).toMatch(/flagged=\{[^}]*'unknown'[^}]*\}/)
    // ...and the Disputed filter does not fall through to the generic empty
    // state when the dispute read failed.
    expect(src).toMatch(/disputed\.kind === 'unknown'/)
    expect(src).toMatch(/disputed\.kind === 'pending'/)
    // The old shape called the predicate directly. If that returns, the
    // state has been discarded again.
    expect(src).not.toMatch(/flagged=\{disputed\(/)
    /*
     * The row must consult the predicate ONLY on 'ready', asserted on the
     * argument because the alternative leaves no behavioural trace:
     * `kind !== 'pending' ? is(row) : 'unknown'` is indistinguishable from
     * the correct version at runtime, since disputeState already builds the
     * predicate from `undefined` when the read errored, so it claims nothing
     * either way. Two guards that agree on every input cannot be
     * mutation-killed individually - and the redundancy is deliberate, so
     * the weaker one is not deleted.
     *
     * It still matters: under that mutant an errored read renders NO flag
     * rather than the unknown label, which is the original false statement
     * returning by a different route.
     */
    expect(src).toMatch(/disputed\.kind === 'ready' \? disputed\.is\(/)
  })

  it('the entry route discloses an unreadable dispute list instead of hiding the section', () => {
    const src = at('../routes/entry.$seq.tsx')
    // Decided in lib/, not refiltered in the route.
    expect(src).toContain('entryDisputes(')
    expect(src).toMatch(/flaggedState\.kind === 'unknown'/)
    expect(src).toMatch(/flaggedState\.kind === 'pending'/)
    /*
     * The rows are read ONLY on 'ready'. Asserted on the argument, same
     * reason as the ledger: any other arm carries no `rows` field, so a
     * cast-based read of it produces `undefined` and then `[]`, which is
     * exactly the empty list the fix exists to stop rendering.
     */
    expect(src).toMatch(/const flagged = flaggedState\.kind === 'ready' \? flaggedState\.rows : \[\]/)
    /*
     * And the CHIP branches three ways. Pinned to its own line rather than to
     * the `kind === 'ready'` text, which also appears on the selection above
     * - a loose pattern here stayed green with the chip reverted to a plain
     * boolean, which is the defect on the most-read element of the screen.
     */
    expect(src).toMatch(/\{flaggedState\.kind === 'ready'\s*\n\s*\? flagged\.some/)
    expect(src).toMatch(/Dispute status unavailable/)
    // The old shape: filter the raw data, then hide the section on an empty
    // result. Either returning is the defect.
    expect(src).not.toMatch(/disputes\.data \?\? \[\]/)
    expect(src).not.toMatch(/^\s*\{flagged\.length > 0 && \(/m)
  })
})

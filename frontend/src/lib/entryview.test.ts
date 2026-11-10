/**
 * A SCREEN MAY NOT SAY "THIS IS NOT A MONEY ENTRY" WHEN IT MEANS "I COULD NOT
 * LOAD IT".
 *
 * `/entry/$seq` had one branch - `!r || !p` - printing one sentence for a
 * failed read, a seq that never existed, and a posting whose proposal was
 * missing. Each is a different thing, and the sentence is a claim about the
 * society's records in all three.
 *
 * Tests `entryOutcome`, the function that DECIDES. A render test of the route
 * would prove what the card says once the outcome is chosen, and the outcome
 * is the bug - the same reason the sign-off oldest-month bug survived six
 * suites that all mounted something.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { entryMessage, entryOutcome, type ReadState } from './entryview'

const ok = (found: boolean): ReadState => ({ isPending: false, isError: false, found })
const pending: ReadState = { isPending: true, isError: false, found: false }
const failed: ReadState = { isPending: false, isError: true, found: false }

describe('entryOutcome', () => {
  it('THE DEFECT: a failed read is never reported as a missing entry', () => {
    /*
     * `data?.find()` is undefined when the query errored exactly as it is when
     * the row is absent, so the route could not tell these apart and chose the
     * confident answer. Both orders, since either read can be the one that
     * fails.
     */
    expect(entryOutcome(true, failed, ok(true)).kind).toBe('unreadable')
    expect(entryOutcome(true, ok(true), failed).kind).toBe('unreadable')
    expect(entryOutcome(true, failed, failed).kind).toBe('unreadable')
  })

  it('reads the failure BEFORE the data, so a cached hit cannot answer for it', () => {
    /*
     * A failed refetch arrives WITH the last good rows still in hand - the
     * shape `verify.stale.test.ts` documents. Found rows plus an error must
     * still be `unreadable`: the question is whether this check is current,
     * and a stale hit does not make it so.
     */
    expect(entryOutcome(true, { isPending: false, isError: true, found: true }, ok(true)).kind)
      .toBe('unreadable')
  })

  it('refuses a seq that is not a number without consulting any read', () => {
    // `/entry/abc` is answerable before the network: Number('abc') is NaN.
    expect(entryOutcome(false, pending, pending).kind).toBe('malformed')
    expect(entryOutcome(false, ok(false), ok(false)).kind).toBe('malformed')
  })

  it('but a FAILED read still outranks a malformed seq', () => {
    // Not an arbitrary order: with a read broken, the page cannot claim to
    // have established anything at all, including about the number itself.
    expect(entryOutcome(false, failed, ok(false)).kind).toBe('unreadable')
  })

  it('says nothing at all while either read is in flight', () => {
    expect(entryOutcome(true, pending, ok(true)).kind).toBe('loading')
    expect(entryOutcome(true, ok(true), pending).kind).toBe('loading')
  })

  it('separates a missing posting from one whose proposal did not come back', () => {
    // `!r || !p` collapsed these. The second is a real entry the reader is
    // looking at, and denying it exists is worse than saying it is partial.
    expect(entryOutcome(true, ok(false), ok(false)).kind).toBe('missing')
    expect(entryOutcome(true, ok(true), ok(false)).kind).toBe('orphaned')
  })

  it('renders only when everything needed is actually here', () => {
    expect(entryOutcome(true, ok(true), ok(true)).kind).toBe('ready')
  })
})

describe('entryMessage', () => {
  it('never tells a reader a seq does not exist on a failed read', () => {
    const m = entryMessage('unreadable', '4216')!
    expect(m).toMatch(/could not be loaded/i)
    // The rule, not the wording: a failure may not deny the record.
    expect(m).not.toMatch(/is not a money entry/i)
    expect(m).toMatch(/not saying it does not exist/i)
  })

  it('does not call an unloadable or absent seq "not a money entry"', () => {
    /*
     * The exact sentence the defect printed. A seq that was never found has
     * not been looked at and classified - it may be an approval or a flag,
     * which is what the full record is for.
     */
    for (const kind of ['unreadable', 'malformed', 'missing'] as const) {
      expect(entryMessage(kind, '99999999')).not.toMatch(/is not a money entry/i)
    }
  })

  it('offers the reader somewhere to look when a seq is simply not a posting', () => {
    const m = entryMessage('missing', '4240')!
    expect(m).toMatch(/4240/)
    expect(m).toMatch(/another kind|approval|flag|appointment/i)
  })

  it('admits an orphaned entry exists rather than denying it', () => {
    const m = entryMessage('orphaned', '4216')!
    expect(m).toMatch(/4216/)
    expect(m).toMatch(/is here|exists/i)
  })

  it('has nothing to say when there is nothing wrong', () => {
    expect(entryMessage('ready', '1')).toBeNull()
    expect(entryMessage('loading', '1')).toBeNull()
  })
})

/*
 * THAT THE ROUTE USES IT. Everything above passes on the broken route, which
 * decided in the JSX and never called into lib/ - an unused decision function
 * is indistinguishable from no fix while looking fully tested.
 */
describe('the entry route is wired to it', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'routes', 'entry.$seq.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('asks entryOutcome what it is allowed to say', () => {
    expect(src).toMatch(/entryOutcome\(/)
    expect(src).toMatch(/entryMessage\(/)
  })

  it('does NOT decide with the old one-branch test', () => {
    // The exact shape of the defect returning.
    expect(src).not.toMatch(/!r \|\| !p/)
  })

  it('no longer hardcodes the sentence that caused this', () => {
    expect(src).not.toMatch(/is not a money entry/)
  })

  it('gates the detail on the ready outcome, not on the rows alone', () => {
    // `r && p` truthiness is what conflated the cases; the outcome has to be
    // what opens the Detail, or the error arm is decorative.
    expect(src).toMatch(/outcome\.kind === 'ready'/)
  })
})

/**
 * A live region has to be in the DOM BEFORE its content changes. Assistive
 * tech announces a node that is inserted already carrying `aria-live`
 * unreliably, and the announcement most likely to be lost is the FIRST one.
 *
 * On the auditor's statement that first announcement is the warning that the
 * byte limit is approaching, at the one irreversible action in this product -
 * `statement.ts` exists because losing that statement loses the auditor's
 * words after they clicked "Sign and close the year". A counter that warns
 * sighted users and silently fails to warn a screen-reader user is the same
 * loss with a narrower blast radius.
 *
 * `year-end.tsx` had `{near && <p aria-live="polite">…}`: the region was
 * CREATED at the moment it first mattered. The fix renders the element always
 * and makes only its content conditional, which keeps the design intent (no
 * counter on a short statement, because brevity is not what an adverse
 * opinion needs) because an empty region announces nothing.
 *
 * This is asserted structurally rather than by rendering. A render test
 * speaks only for the screen it mounts, and what is wrong here is a
 * LIFECYCLE: jsdom has no accessibility tree and no announcement queue, so
 * mounting the component at `near === true` passes under both the defect and
 * the fix. The decision this screen makes - how much room is left, in which
 * unit - is `checkStatement`, tested in `statement.test.ts`.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROUTE = resolve(__dirname, '..', 'routes', 'year-end.tsx')
const LEDGER = resolve(__dirname, '..', 'routes', 'ledger.tsx')

/*
 * Comments stripped. The prose above the region names `aria-live`, `near` and
 * the whole defect, so a comment-blind scan would find every string it looks
 * for in a file that had been reverted to the broken form.
 */
const strip = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')

const source = () => strip(ROUTE)

describe("the auditor's statement counter is announced, not just displayed", () => {
  it('reads the route at all', () => {
    const s = source()
    expect(s.length, 'year-end.tsx came back empty: the scan is looking in the wrong place')
      .toBeGreaterThan(1000)
    expect(s, 'the statement counter region is gone entirely').toContain('aria-live')
  })

  it('declares the threshold it gates the content on', () => {
    /*
     * The DECLARATION, not only the uses. Deleting `const near = …` leaves
     * every `near` reference in place: that does not compile, but vitest does
     * not typecheck, so a guard asserting only the uses passes on a file
     * whose threshold does not exist.
     */
    expect(source(), 'the `near` threshold is not declared in the route')
      .toMatch(/const near =/)
  })

  it('does not create the live region at the moment it first matters', () => {
    /*
     * The defect, written exactly as it was: `{near && (<p … aria-live …`.
     * Any form that gates the ELEMENT on the threshold is the same bug.
     */
    const s = source()
    const gatedElement = /\{\s*near\s*&&\s*\(?\s*<p/
    expect(
      gatedElement.test(s),
      'the aria-live counter is created by `near`, so its first announcement - the one that warns the auditor - may never be made',
    ).toBe(false)
  })

  it('renders the region unconditionally and gates only its content', () => {
    const s = source()
    const region = s.indexOf('aria-live')
    expect(region, 'no aria-live region found').toBeGreaterThan(-1)

    /*
     * Walk back from `aria-live` to the `<p` that owns it and check what
     * precedes that tag. An unconditional element is preceded by markup, not
     * by `{near &&`.
     */
    const tag = s.lastIndexOf('<p', region)
    expect(tag, 'the aria-live attribute is not on a <p>').toBeGreaterThan(-1)
    const before = s.slice(Math.max(0, tag - 40), tag)
    expect(before, 'the region is still gated on the threshold').not.toMatch(/near\s*&&\s*\(?\s*$/)

    /*
     * And the content IS still conditional, or the fix overshot into showing
     * a counter on a two-paragraph opinion - noise that suggests brevity is
     * wanted, which is not what an adverse opinion needs.
     */
    const close = s.indexOf('</p>', region)
    const body = s.slice(region, close)
    expect(body, 'the counter content is no longer gated: a short statement now shows a counter')
      .toMatch(/\{\s*near\s*&&/)
  })

  it('wires the region to the textarea it describes', () => {
    /*
     * Announcing into the void is not the same as announcing. The region's id
     * has to be the textarea's `aria-describedby`, or a screen-reader user
     * reaching the field is never pointed at the counter at all.
     */
    const s = source()
    const idMatch = s.match(/<p\s+id="([^"]+)"[^>]*aria-live/)
    expect(idMatch, 'the aria-live region has no id, so nothing can reference it').not.toBeNull()
    const id = idMatch![1]!
    expect(s, `the textarea does not reference the counter region (${id})`)
      .toMatch(new RegExp(`aria-describedby=\\{[^}]*'${id}'`))
  })
})

/*
 * The same rule, the other place it was needed. A resident filtering the
 * ledger from forty rows to none, or back, had no announcement at all: there
 * was no `aria-live` anywhere in that route, so a screen-reader user could not
 * tell "nothing matches" from "still loading" from "the filter did not apply".
 * The ledger is already the most confusable surface in this product for a
 * non-technical resident.
 */
describe('the ledger announces how many entries the filter left', () => {
  it('reads the route at all', () => {
    expect(strip(LEDGER).length, 'ledger.tsx came back empty: the scan is looking in the wrong place')
      .toBeGreaterThan(1000)
  })

  it('has a live region for the result count', () => {
    expect(strip(LEDGER), 'the ledger reports its result count to nobody who cannot see the rows')
      .toContain('aria-live')
  })

  it('renders that region unconditionally, with only its text conditional', () => {
    /*
     * Finding 12's rule, applied here before it could be broken here. The
     * FIRST message is the one that matters most - the search that found
     * nothing - so a region created when it first has something to say is
     * exactly the wrong shape.
     */
    const s = strip(LEDGER)
    const region = s.indexOf('aria-live')
    const tag = s.lastIndexOf('<p', region)
    expect(tag, 'the aria-live attribute is not on a <p>').toBeGreaterThan(-1)
    const before = s.slice(Math.max(0, tag - 60), tag)
    expect(before, 'the count region is created conditionally, so its first announcement may be lost')
      .not.toMatch(/&&\s*\(?\s*$/)
    expect(before, 'the count region sits in a ternary arm, so it is created conditionally')
      .not.toMatch(/[?:]\s*$/)
  })

  it('says nothing while the ledger is still loading', () => {
    /*
     * "0 entries" during a load is a WRONG answer, not a slow one - the same
     * mistake as an unreadable figure rendering as a confident zero. `Loading`
     * already carries its own role="status".
     */
    const s = strip(LEDGER)
    const region = s.indexOf('aria-live')
    const body = s.slice(region, s.indexOf('</p>', region))
    expect(body, 'the count region does not suppress itself while pending: it will announce "0 entries" during a load')
      .toMatch(/isPending/)
  })

  it('is for screen readers only, since the rows are the visible answer', () => {
    const s = strip(LEDGER)
    const region = s.indexOf('aria-live')
    const tag = s.lastIndexOf('<p', region)
    expect(s.slice(tag, region), 'the count region is not sr-only, so it duplicates what the rows already show')
      .toContain('sr-only')
  })
})

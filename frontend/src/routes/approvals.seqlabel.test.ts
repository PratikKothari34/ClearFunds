/**
 * THE ENTRY NUMBER MUST SAY WHAT IT IS A NUMBER OF.
 *
 * The approvals card wrote a bare `#${p.seq}` into its fact line, which a
 * screen reader announces as "number 4252" or "hash 4252" with nothing
 * saying what the number counts - while `disputes.tsx` already writes
 * "Entry #N" in full. This is the identifier a resident quotes to the
 * committee when they ask about a payment, so it is the one fact on the card
 * that has to survive being read aloud.
 *
 * The label is `sr-only` rather than visible: the fact line is three items on
 * one narrow row at 390px, and widening it to "Entry #4252" pushes the time
 * or the action label to a second line on a phone.
 *
 * Verified in the browser, not only here: the span computes to the clipped
 * 1x1 box the separators use, and a screenshot confirms the line still reads
 * "Limit change | 3 h ago | #4252". `innerText` reports sr-only content as
 * visible, so it is not evidence either way - the measurement is.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(import.meta.dirname, 'approvals.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

describe('the proposal card labels its entry number', () => {
  it('THE DEFECT: the seq is not a bare "#" in the fact line', () => {
    // The broken shape, exactly: `#${p.seq}` as a template string item.
    expect(src).not.toMatch(/`#\$\{p\.seq\}`/)
  })

  it('says "Entry" to a screen reader', () => {
    expect(src).toMatch(/<span className="sr-only">Entry <\/span>#\{p\.seq\}/)
  })

  it('keeps the label out of the visible line', () => {
    /*
     * A visible "Entry" would push a three-item fact line onto two rows at
     * phone width. If this is ever made visible on purpose, this test should
     * be deleted deliberately rather than relaxed.
     */
    const m = /<span className="sr-only">Entry <\/span>/.exec(src)
    expect(m).not.toBeNull()
  })

  it('still renders the number itself', () => {
    /*
     * Deliberately true of the BROKEN shape too - `#${p.seq}` also renders
     * the number. It is here so that a future edit which drops the seq
     * entirely, rather than merely unlabelling it, fails something. It does
     * not discriminate the defect and is not the guard; the three cases
     * above are.
     */
    expect(src).toMatch(/p\.seq/)
  })
})

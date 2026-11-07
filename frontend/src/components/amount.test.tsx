/*
 * THE FIGURE NOBODY COULD READ, AND WHAT COLOUR IT COMES OUT.
 *
 * Six call sites hardcode a money colour through className - `text-debit`
 * under an "Out" heading, where the COLUMN asserts the direction and the
 * magnitude has no sign to contradict, so those are correct. But className
 * was appended last on the unreadable branch, so "not available" could render
 * in debit red: a claim that money went out, about a figure nobody could read.
 *
 * It rendered correctly only because Tailwind emits .text-debit before
 * .text-ink-2, so source order decided it rather than any code. A utility
 * reorder or a renamed class flips that with no test failing - which is why
 * this asserts on the rendered element instead of on the stylesheet.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Amount } from './ui'

const cls = (ui: React.ReactElement) => {
  const el = render(ui).container.firstElementChild
  if (!el) throw new Error('rendered nothing')
  return el.className
}

/* Exactly what the six call sites pass. */
const callSites: [string, string][] = [
  ['sign-off, per month', 'text-debit'],
  ['sign-off, the Out tile', 'font-semibold text-debit'],
  ['sign-off, the In tile', 'font-semibold text-credit'],
  ['the dashboard, money in', 'text-credit'],
  ['the dashboard, money out', 'text-debit'],
  ['the ledger month header, out', 'text-xs text-debit'],
  ['my flat, what it owes', 'text-debit'],
]

/** How many money colours one element carries. Two is the defect. */
const colours = (c: string) => (c.match(/text-(debit|credit)\b/g) ?? []).length

describe('an unreadable amount never borrows a direction from its caller', () => {
  it('says not available, whatever the call site asked for', () => {
    for (const [, c] of callSites) {
      const el = render(<Amount minor={null} className={c} />).container.firstElementChild
      expect(el?.textContent).toBe('not available')
    }
  })

  it('drops the money colour a caller hardcoded', () => {
    // The defect. Not "text-ink-2 also present" - absent, so no stylesheet
    // ordering can bring it back.
    for (const [where, c] of callSites) {
      const out = cls(<Amount minor={null} className={c} />)
      expect(out, `${where} painted the disclosure debit`).not.toMatch(/text-debit/)
      expect(out, `${where} painted the disclosure credit`).not.toMatch(/text-credit/)
    }
  })

  it('still colours the disclosure itself, rather than leaving it unstyled', () => {
    // Dropping the caller's colour must not drop ALL colour: an unstyled
    // "not available" inherits whatever surrounds it, which on a coloured
    // tile is the same problem again.
    expect(cls(<Amount minor={null} className="text-debit" />)).toMatch(/text-ink-2/)
    expect(cls(<Amount minor={null} />)).toMatch(/text-ink-2/)
  })

  it('keeps the caller classes that are not colours', () => {
    // Weight, size and layout are still wanted - a disclosure that loses its
    // font-semibold reflows the tile it sits in.
    const out = cls(<Amount minor={null} className="font-semibold text-debit text-xs" />)
    expect(out).toMatch(/font-semibold/)
    expect(out).toMatch(/text-xs/)
  })

  it('leaves a READABLE amount coloured exactly as the call site asked', () => {
    // The over-correction guard. The six call sites are correct for readable
    // figures: the column asserts the direction and the magnitude is
    // unsigned. Stripping their colour there would silently de-colour every
    // In/Out figure in the product.
    expect(cls(<Amount minor={250000} className="text-debit" />)).toMatch(/text-debit/)
    expect(cls(<Amount minor={250000} className="text-credit" />)).toMatch(/text-credit/)
    expect(cls(<Amount minor={0} className="text-debit" />)).toMatch(/text-debit/)
  })

  it('never renders two money colours on one element', () => {
    /*
     * This test was written asserting only that text-debit was PRESENT, and
     * it passed while the element carried `text-debit text-credit` together -
     * proving nothing. Both colours rendered, and which the resident saw was
     * decided by stylesheet emission order.
     *
     * So it counts them instead. tone="auto" decides from the sign; a caller
     * passing a colour as well is asserting a direction the figure may
     * contradict, and the deciding tone must win outright rather than tie.
     */
    for (const [minor, passed] of [[-1, 'text-credit'], [1, 'text-debit'], [0, 'text-debit'], [-1, 'text-debit']] as const) {
      const out = cls(<Amount minor={minor} tone="auto" className={passed} />)
      expect(colours(out), `${minor} with ${passed} rendered: ${out}`).toBeLessThanOrEqual(1)
    }
  })

  it('lets the deciding tone win, not the stylesheet', () => {
    // tone="auto" partitions three ways (ui.tsx), so a negative figure is
    // debit whatever the call site passed, and zero claims no direction.
    expect(cls(<Amount minor={-1} tone="auto" className="text-credit" />)).toMatch(/text-debit/)
    expect(cls(<Amount minor={1} tone="auto" className="text-debit" />)).toMatch(/text-credit/)
    const zero = cls(<Amount minor={0} tone="auto" className="text-debit" />)
    expect(zero).not.toMatch(/text-debit/)
    expect(zero).not.toMatch(/text-credit/)
  })

  it('keeps a muted figure muted, whatever the caller passed', () => {
    // tone="muted" is the non-cash case on the entry screen: billed to
    // flats, not cash. A debit colour there claims cash left the society.
    const out = cls(<Amount minor={-250000} tone="muted" className="text-debit" />)
    expect(out).toMatch(/text-ink-2/)
    expect(out).not.toMatch(/text-debit/)
  })

})

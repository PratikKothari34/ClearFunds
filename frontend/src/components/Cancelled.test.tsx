import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Cancelled } from './Cancelled'

afterEach(cleanup)

/*
 * A STRIKE-THROUGH IS ANNOUNCED BY NOTHING.
 *
 * The amount of a cancelled payment, struck through and not otherwise
 * marked, is read to a screen reader user as a live figure. That is the
 * worst single rendering failure available in this product, and it had
 * already happened: EntryRow's narration carried the visually-hidden
 * word and its amount did not, while the file's own header said the
 * amount carried both.
 */
describe('Cancelled', () => {
  it('strikes the content through', () => {
    const { container } = render(<Cancelled>₹1,25,000.00</Cancelled>)
    const struck = container.querySelector('s')
    expect(struck, 'nothing is struck through').toBeTruthy()
    expect(struck?.textContent).toContain('₹1,25,000.00')
  })

  it('says cancelled in the text, not only in the styling', () => {
    const { container } = render(<Cancelled>₹1,25,000.00</Cancelled>)
    /*
     * The TEXT, because that is what is announced. A test asserting the
     * class name would pass on a `cf-sr-only` span that was empty, and
     * an empty span is exactly as silent as no span.
     */
    expect(container.textContent).toMatch(/cancelled/i)
  })

  it('separates the word from the content it follows', () => {
    // Without the space a screen reader runs the figure and the word
    // together into one token.
    const { container } = render(<Cancelled>12.50</Cancelled>)
    expect(container.textContent).toMatch(/12\.50\s+\(cancelled\)/i)
  })

  it('keeps the word out of the visual layout', () => {
    /*
     * Hidden visually but present to assistive technology - never
     * `display: none` or `aria-hidden`, either of which removes it from
     * the accessibility tree and takes the announcement with it.
     */
    const { container } = render(<Cancelled>x</Cancelled>)
    const word = [...container.querySelectorAll('span')].find((el) =>
      /cancelled/i.test(el.textContent ?? ''),
    )
    expect(word, 'the word is not in a span of its own').toBeTruthy()
    expect(word?.className).toContain('cf-sr-only')
    expect(word?.getAttribute('aria-hidden')).toBeNull()
  })
})

/*
 * The call sites, checked in the SOURCE rather than by rendering.
 *
 * Two of the three sites are in route files, which cannot be rendered
 * in a test at all: `autoCodeSplitting` rewrites everything under
 * `routes/` and replaces the component with a lazy reference, so a
 * render produces an empty container and every absence assertion
 * passes against ''. Reading the source is what can actually fail here.
 */
describe('nobody hand-rolls the pairing', () => {
  const files = [
    'src/components/EntryRow.tsx',
    'src/routes/ledger.$entryId.tsx',
  ]

  /*
   * Comments are stripped before matching, and that is not a
   * convenience.
   *
   * Both of these files DISCUSS `<s>` in their header prose - they have
   * to, because the rule is the reason they are written the way they
   * are - so a match against the raw text fails on correct code and the
   * guard gets deleted or loosened into uselessness. This is the third
   * time a bare-word assertion in this codebase has punished the
   * explanation rather than the defect; the assertion has to be about
   * the JSX.
   */
  function code(file: string): string {
    return readFileSync(resolve(process.cwd(), file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
  }

  it('no call site writes its own strike-through', () => {
    for (const file of files) {
      /*
       * A bare `<s>` is the bug: it is the half that is visible and
       * silent. `Cancelled` owns the only one in the codebase, so any
       * other occurrence is a site that will drift.
       */
      const bare = code(file).match(/<s>/g) ?? []
      expect(bare, `${file} writes its own <s> instead of using Cancelled`)
        .toHaveLength(0)
    }
  })

  it('still reads the files it claims to read', () => {
    /*
     * The control for the stripping above. A regex bug that emptied
     * `code()` would make both absence assertions pass on nothing -
     * the vacuous-absence trap, arriving by a different route.
     */
    for (const file of files) {
      const stripped = code(file)
      expect(stripped.length, `${file} stripped to nothing`).toBeGreaterThan(200)
      expect(stripped, `${file} lost its JSX`).toMatch(/return \(/)
    }
  })

  it('no call site writes its own cancelled word either', () => {
    // The mirror of the above: a site with the word and no strike is
    // not a bug, but it means the pair is being assembled by hand
    // again, which is how the two halves separated the first time.
    for (const file of files) {
      const inJsx =
        code(file).match(/className="cf-sr-only">\s*\(cancelled\)/gi) ?? []
      expect(inJsx, `${file} hand-writes the cancelled word`).toHaveLength(0)
    }
  })

  it('every one of those files does use Cancelled', () => {
    // The control. Without this the two assertions above pass on a
    // file that renders nothing about reversals at all - or on a path
    // that stopped existing.
    for (const file of files) {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(src, `${file} no longer uses Cancelled`).toMatch(/<Cancelled>/)
    }
  })
})

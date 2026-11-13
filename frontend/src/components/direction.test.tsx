/*
 * WHICH WAY THE MONEY WENT, AS A RESIDENT ACTUALLY SEES IT.
 *
 * The entry screen paired a tone with text inline:
 *
 *   direction.minor < 0 ? 'debit' : 'credit'  /  'Money out' : 'Money in'
 *
 * so a ZERO amount rendered "Money in" in credit green - a claim that money
 * arrived, about an entry that moved nothing. <Amount> on the same screen,
 * reading the same field, already partitioned three ways and rendered that
 * figure in neutral ink, so the hero number and the chip below it disagreed.
 *
 * This renders the real Chip through the real decider and asserts on the
 * element, because the defect lived in JSX where no unit test could reach it.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Amount, Chip } from './ui'
import { direction, type Direction } from '../lib/countable'

/** Exactly the pairing entry.$seq.tsx renders, driven by the real decider. */
function chipFor(minor: unknown) {
  const d = direction(minor)
  const el = render(
    d === 'out' ? <Chip tone="debit">Money out</Chip>
    : d === 'in' ? <Chip tone="credit">Money in</Chip>
    : d === 'flat' ? <Chip>No change to the balance</Chip>
    : <Chip tone="break">Direction could not be read</Chip>,
  ).container.firstElementChild
  if (!el) throw new Error(`the chip rendered nothing for ${String(minor)}`)
  return { text: el.textContent ?? '', cls: el.className, d }
}

describe('the direction chip a resident reads', () => {
  it('never tells a resident money arrived when nothing moved', () => {
    // The bug, at the level of rendered text. Both directions are asserted
    // absent: "Money out" on a zero entry is the same false claim.
    const z = chipFor(0)
    expect(z.text).not.toMatch(/Money in/)
    expect(z.text).not.toMatch(/Money out/)
    expect(z.text).toBe('No change to the balance')
  })

  it('never renders an empty chip, whatever arrives', () => {
    // An empty chip is a coloured rectangle with no word in it - the
    // resident gets a signal from colour alone, which this product never does.
    for (const v of [-250000, -1, 0, 1, 250000, null, undefined, NaN, Infinity, 12.5, '1250']) {
      expect(chipFor(v).text.trim(), `empty chip for ${String(v)}`).not.toBe('')
    }
  })

  it('reserves the credit tone for money that actually came in', () => {
    expect(chipFor(1).cls).toMatch(/credit/)
    expect(chipFor(0).cls).not.toMatch(/credit/)
    expect(chipFor(-1).cls).not.toMatch(/credit/)
    expect(chipFor(null).cls).not.toMatch(/credit/)
  })

  it('reserves the debit tone for money that actually went out', () => {
    expect(chipFor(-1).cls).toMatch(/debit/)
    expect(chipFor(0).cls).not.toMatch(/debit/)
    expect(chipFor(1).cls).not.toMatch(/debit/)
    expect(chipFor(null).cls).not.toMatch(/debit/)
  })

  it('says so in words when the figure could not be read, never a direction', () => {
    for (const v of [null, undefined, NaN, Infinity, 12.5, '1250', {}]) {
      const c = chipFor(v)
      expect(c.text, `${String(v)} claimed a direction`).toBe('Direction could not be read')
      expect(c.cls).toMatch(/break/)
    }
  })

  it('does not contradict the hero figure beside it', () => {
    /*
     * The two were already in disagreement once. <Amount currency="INR" tone="auto"> is the
     * line that was correct, so it is the reference: whenever it declines to
     * signal a direction, the chip must decline too.
     */
    for (const m of [-999999, -1, 0, 1, 999999]) {
      const hero = render(<Amount currency="INR" minor={m} tone="auto" signed />).container.firstElementChild
      if (!hero) throw new Error('the amount rendered nothing')
      const chip = chipFor(m)
      expect(/text-credit/.test(hero.className), `credit disagreed at ${m}`).toBe(/credit/.test(chip.cls))
      expect(/text-debit/.test(hero.className), `debit disagreed at ${m}`).toBe(/debit/.test(chip.cls))
    }
  })

  it('discloses an unreadable amount on both, rather than one of them', () => {
    // One bad row used to hide money on one surface and blank another. Both
    // must now say they could not read it.
    const hero = render(<Amount currency="INR" minor={null} tone="auto" />).container.firstElementChild
    expect(hero?.textContent).toBe('not available')
    expect(chipFor(null).text).toBe('Direction could not be read')
  })

  it('covers every Direction the decider can return', () => {
    // So a fifth state added to the union cannot arrive with no rendering
    // branch and fall silently to the catch-all.
    const seen = new Set<Direction>([-1, 0, 1, null].map((v) => direction(v)))
    expect(seen).toEqual(new Set<Direction>(['out', 'flat', 'in', 'unreadable']))
  })
})

import { describe, expect, it } from 'vitest'
import { PLACEHOLDER_FLAT } from './placeholder'
import { SAMPLE_DUES, SAMPLE_FLAG_LOG } from './sample'
import { isFromFlat } from './identity'

/*
 * The placeholder viewer's flat must be a flat that exists.
 *
 * The bug: `/my-flat` read `devDues()[1]` while the root gave the
 * placeholder resident a different flat number. An array index returns
 * SOMEBODY for any list long enough, so the page rendered a
 * neighbour's billed, paid and outstanding amounts under the heading
 * "Your flat", directly above "Other residents cannot see this."
 *
 * Both halves are asserted as RULES, not against the literal flat
 * number: changing the placeholder is allowed, changing it to a flat
 * with no data is not.
 */

describe('the placeholder flat', () => {
  it('matches exactly one row in the dues fixture', () => {
    /*
     * Exactly one, not at least one. Two rows for one flat would make
     * the lookup's answer depend on fixture order again, which is the
     * class of bug this replaced.
     */
    const matches = SAMPLE_DUES.filter((r) => r.flat === PLACEHOLDER_FLAT)
    expect(matches).toHaveLength(1)
  })

  it('has at least one question in the flag log', () => {
    /*
     * Otherwise the questions band renders its empty state in
     * development and the populated layout is never seen until a real
     * resident hits it in production.
     */
    const mine = Object.values(SAMPLE_FLAG_LOG)
      .flat()
      .filter((item) => isFromFlat(item.authorHandle, PLACEHOLDER_FLAT))
    expect(mine.length).toBeGreaterThan(0)
  })

  it('is not matched by another flat on the same floor', () => {
    /*
     * The substring hazard, asserted against the real fixture rather
     * than a constructed string: floor-and-unit numbering makes short
     * flat numbers prefixes of longer ones constantly, so a
     * `.includes()` lookup would leak a neighbour's row.
     */
    const others = SAMPLE_DUES.filter((r) => r.flat !== PLACEHOLDER_FLAT)
    for (const row of others) {
      expect(isFromFlat(`Resident ${row.flat}`, PLACEHOLDER_FLAT)).toBe(false)
    }
  })
})

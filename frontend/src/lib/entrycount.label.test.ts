/**
 * TWO COUNTS OF DIFFERENT THINGS MAY NOT SHARE ONE NOUN.
 *
 * The home card printed "989 entries" under the society balance; `/verify`
 * printed "4,254 entries checked". Measured on the seeded society:
 *
 *   select count(*) from public.ledger        -> 989
 *   select count(*) from public.chain_entries -> 4254
 *
 * Both figures are correct. The home card counts money postings - the ones
 * that produced the balance directly above it - and `/verify` counts every
 * record in the chain, including approvals, appointments, flags, resolutions
 * and opinions. Nothing throws, no arithmetic is wrong, and no test failed.
 *
 * The screen is still false about the society. A resident who compares the two
 * reads the chain as covering 3,265 records the ledger does not show them,
 * which is precisely the suspicion this product exists to answer. The reader
 * who does the most work to check is the one most misled - the same shape as
 * the spend card printing a total the rows above it contradicted.
 *
 * WHY THIS IS A SOURCE SWEEP AND NOT A RENDER TEST. The decision is which noun
 * each figure is entitled to, and it is made where the string is built. A
 * render test proves what one screen says once the noun is chosen; it cannot
 * see that a SECOND screen chose the same noun for a different population, and
 * the collision between the two is the whole defect. Nothing in `lib/` is
 * reachable to test instead: `plural` is a correct pure formatter that knows
 * nothing about what is counted, and giving it an opinion about nouns would be
 * the wrong home for a rule about two specific screens.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const route = (name: string) =>
  readFileSync(join(import.meta.dirname, '..', 'routes', name), 'utf8')
    // This file's own prose and the routes' prose both name these strings.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const home = route('index.tsx')
const verify = route('verify.tsx')

describe('the two entry counts name what they count', () => {
  it('finds the count in each route at all', () => {
    // Without this the assertions below pass vacuously if either call site is
    // renamed, moved or deleted - the sweep would stop measuring in silence.
    expect(home, 'the home balance card no longer prints an entry count')
      .toMatch(/plural\(s\.entries,/)
    expect(verify, '/verify no longer prints an entry count')
      .toMatch(/plural\(check!\.entries,/)
  })

  it('THE DEFECT: neither count calls itself a bare "entry"', () => {
    /*
     * The exact shape of the bug. `plural(s.entries, 'entry', 'entries')` on
     * one screen and `plural(check!.entries, 'entry', 'entries')` on the other
     * is two populations under one word.
     */
    expect(home, 'the home count is a bare "entry" again - it counts money postings, not the chain')
      .not.toMatch(/plural\(s\.entries,\s*'entry'/)
    expect(verify, 'the /verify count is a bare "entry" again - it counts the whole chain, not postings')
      .not.toMatch(/plural\(check!\.entries,\s*'entry'/)
  })

  it('the home card says it counts money, since it sits under the balance', () => {
    expect(home).toMatch(/plural\(s\.entries,\s*'money entry',\s*'money entries'\)/)
  })

  it('/verify says it counts the chain, which is wider than the ledger', () => {
    expect(verify).toMatch(/plural\(check!\.entries,\s*'chain entry',\s*'chain entries'\)/)
  })

  it('and the two nouns are still different from each other', () => {
    /*
     * The invariant behind all of the above, asserted on its own so that
     * "fixing" one screen by copying the other's noun fails here. Any pair of
     * distinct, self-describing nouns passes; the identical pair does not.
     */
    const noun = (src: string, call: RegExp) => src.match(call)?.[1]
    const h = noun(home, /plural\(s\.entries,\s*'([^']+)'/)
    const v = noun(verify, /plural\(check!\.entries,\s*'([^']+)'/)
    expect(h, 'the home noun went missing').toBeTruthy()
    expect(v, 'the /verify noun went missing').toBeTruthy()
    expect(h, 'both screens are counting different things under the same word again').not.toBe(v)
  })
})

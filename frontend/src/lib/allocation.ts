import { array, int, object, required, str } from './parse'
import type { Parser } from './parse'

/*
 * THE PER-FLAT SPLIT OF A CHARGE, read out of a chain entry body.
 *
 * `entry.$seq.tsx` used to reach this with `e.body as unknown as {...}` - a
 * cast, which checks nothing - and then do arithmetic on the result. Three
 * paths threw, and the render boundary added later contains such a throw to
 * one screen without recovering the figure, so each one still costs the whole
 * entry-detail screen rather than one line:
 *
 *   - `Math.min(...[])` is `Infinity`, and `format()` raises RangeError on
 *     anything that is not a safe integer. `ledger.v1.md` item 16 says
 *     `flat_ids` is "Empty otherwise", so an empty allocation is a LEGITIMATE
 *     response for a non-charge proposal, not corruption. The crash was
 *     reachable in normal operation.
 *   - `body.flat_ids.length` on an absent field is a TypeError.
 *   - `line_amounts[mine]!` asserts non-null on a short list, and the
 *     undefined then reaches `parts()`.
 *
 * So the body is parsed, and `lines()` pairs the two lists by index rather
 * than letting a caller assume they are the same length. Same reasoning as
 * countable.ts: the premise of the verifier is that what the server sends is
 * recomputed rather than trusted, and a cast is where we were still trusting
 * it. A mismatch is DISCLOSED, never folded into a figure.
 */

export type Allocation = {
  flat_ids: string[]
  line_amounts: number[]
  remainder_flats: string[]
  flat_set: string | null
}

export const allocationBody: Parser<Allocation> = object<Allocation>({
  flat_ids: required(array(str)),
  line_amounts: required(array(int)),
  remainder_flats: required(array(str)),
  /* Not `oneOf`: a fourth value is for `flatSetLabel` to hedge over, not a
   * reason to refuse the whole split. `null` on a non-charge entry. */
  flat_set: (v, p) => (v === null || v === undefined ? null : str(v, p)),
})

/** A flat and what it was charged, paired by index so neither list is assumed. */
export type Line = { flat_id: string; minor: number; remainder: boolean }

/*
 * The split as rows, plus what could not be read.
 *
 * `lines` holds only indices present in BOTH lists. `mismatch` is true when
 * the two lists disagree in length - a broken entry, surfaced rather than
 * silently truncated, because a flat missing from the list it should be in is
 * a flat whose charge nobody is being shown.
 */
export function split(a: Allocation): {
  lines: Line[]
  mismatch: boolean
  each: number | null
  remainderCount: number
} {
  const n = Math.min(a.flat_ids.length, a.line_amounts.length)
  const extra = new Set(a.remainder_flats)
  const lines: Line[] = []
  for (let i = 0; i < n; i++) {
    lines.push({ flat_id: a.flat_ids[i]!, minor: a.line_amounts[i]!, remainder: extra.has(a.flat_ids[i]!) })
  }
  /*
   * The base share: the smallest line by magnitude, signed like the lines
   * themselves. `null` for an empty split, because `Math.min()` of nothing is
   * Infinity and a surface must say "not available" rather than format it.
   * Sign comes from a line, not from the entry total, so a negated charge
   * reversal (item 17) reads negative without a second source of truth.
   */
  const mags = lines.map((l) => Math.abs(l.minor))
  const each = mags.length === 0 ? null : Math.min(...mags) * (lines.some((l) => l.minor < 0) ? -1 : 1)
  return {
    lines,
    mismatch: a.flat_ids.length !== a.line_amounts.length,
    each,
    remainderCount: a.remainder_flats.length,
  }
}

/** Where a flat sits in the split, or -1. Never indexes past the pairs. */
export const lineFor = (s: { lines: Line[] }, flatId: string | null | undefined): Line | null =>
  flatId == null ? null : (s.lines.find((l) => l.flat_id === flatId) ?? null)

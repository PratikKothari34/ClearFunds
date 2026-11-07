/*
 * HOW MUCH OF A MONTH'S IN AND OUT IS A REVERSAL?
 *
 * `in_minor` and `out_minor` are POSTED movements, so a reversal sits in them
 * GROSS. A reversed Rs 9,000 expense adds 9,000 to `in_minor`, though nobody
 * paid the society anything - it is the correction of a payment, not a
 * receipt. That is deliberate and must stay: in less out has to equal the
 * balance, and `0004` says balances net reversed pairs to zero by
 * construction rather than by special-casing.
 *
 * So a month with one reversed expense reads "In Rs 9,000" on the dashboard
 * and the resident concludes the society received Rs 9,000. Nothing is wrong
 * with the figure; the screen is wrong about what it means.
 *
 * `reversed_in_minor` and `reversed_out_minor` (#115) say how much of each
 * side is reversals, both reported POSITIVE. This module decides what a
 * surface may SAY about that pair. It does not compute a net figure, and no
 * caller may either:
 *
 *   - Netting is money arithmetic in the client, which `0002` forbids
 *     outright. `in_minor - reversed_in_minor` is a figure no server
 *     computed and nothing reconciles against the chain.
 *   - The disclosure is the point. A resident who is told "Rs 9,000 of this
 *     is a correction" can read the gross figure correctly. A resident shown
 *     a quietly netted Rs 0 has been told the month was empty, and the
 *     reversal - the thing the chain exists to prove happened - has been
 *     concealed. `0004`: reversed entries always appear in reports.
 *
 * THREE STATES, NEVER TWO, for the reason countable.ts has three. The server
 * chooses these numbers, and `undefined > 0` is false, so a missing or
 * broken key would take exactly the branch meaning "no reversals" - the
 * disclosure would silently never render and the screen would go back to
 * quietly overstating the month. rows.ts marks both keys `required(int)` so
 * absent fails loudly at the parser; this is the second guard, and it is
 * deliberately redundant with that one. See commit-checks.md on why a
 * redundant guard is not deleted because a single mutant cannot kill it.
 */

import { countable } from './countable'

/**
 * What a surface may say about one side of a month.
 *
 * `none`   - the side was read and holds no reversals. Say nothing.
 * `some`   - `minor` of the side is reversals, positive. Disclose it.
 * `unknown`- the pair could not be read, or contradicts the side it is part
 *            of. Say that it could not be read; never a reassuring silence.
 */
export type Reversed =
  | { kind: 'none' }
  | { kind: 'some'; minor: number }
  | { kind: 'unknown' }

/**
 * One side of a month: the posted total and the reversed part of it.
 *
 * Both arrive as `unknown` on purpose. Declaring them `number` would make
 * the compiler assert something only a cast backs - the same false guarantee
 * that let a null reach a comparison in countable.ts.
 */
export function reversedPart(sideMinor: unknown, reversedMinor: unknown): Reversed {
  const side = countable(sideMinor)
  const part = countable(reversedMinor)
  if (!side.readable || !part.readable) return { kind: 'unknown' }
  /*
   * The server reports both sides positive, so a negative reversed part is
   * not a smaller number - it is a figure that does not mean what this
   * module's callers will read it as. Refuse it.
   */
  if (part.minor < 0 || side.minor < 0) return { kind: 'unknown' }
  /*
   * REFUSE, NEVER CLAMP. A reversed part larger than the side it is part of
   * cannot be true: it would render "Rs 12,000 of this Rs 9,000 is a
   * correction". Clamping to the side would publish a figure no server
   * computed, and clamping to zero would report the honest answer "none" for
   * a month whose data is broken - the exact silence this module exists to
   * prevent. Two figures that cannot both be right establish nothing.
   */
  if (part.minor > side.minor) return { kind: 'unknown' }
  if (part.minor === 0) return { kind: 'none' }
  return { kind: 'some', minor: part.minor }
}

/** A month row as these surfaces read it, by shape rather than by import. */
type MonthSide = { in_minor: unknown; out_minor: unknown; reversed_in_minor: unknown; reversed_out_minor: unknown }

/** The reversed part of a month's money IN. */
export function reversedIn(month: MonthSide | undefined): Reversed {
  if (!month) return { kind: 'unknown' }
  return reversedPart(month.in_minor, month.reversed_in_minor)
}

/** The reversed part of a month's money OUT. */
export function reversedOut(month: MonthSide | undefined): Reversed {
  if (!month) return { kind: 'unknown' }
  return reversedPart(month.out_minor, month.reversed_out_minor)
}

/**
 * Whether a month carries any reversal at all, for a surface that discloses
 * once rather than per side.
 *
 * `unknown` wins over `none`: if either side is unreadable the honest answer
 * is that we do not know, and collapsing that to `none` is how a screen
 * returns to silently overstating the month.
 */
export function monthHasReversal(month: MonthSide | undefined): Reversed['kind'] {
  const i = reversedIn(month)
  const o = reversedOut(month)
  if (i.kind === 'unknown' || o.kind === 'unknown') return 'unknown'
  return i.kind === 'some' || o.kind === 'some' ? 'some' : 'none'
}

/*
 * WHY `spent` CANNOT KEEP ITS NAME.
 *
 * sign-off.tsx labelled `out_minor` "spent". A reversed receipt is money out
 * and was not spending, so the word is false whenever the month holds one -
 * and the auditor reads that figure at the one irreversible action in the
 * product. There is no arithmetic fix available to this lane: the figure is
 * right, the word is wrong. So the word changes to the one the figure
 * actually supports, and the reversed part is disclosed beside it.
 */
export const OUT_LABEL = 'out'

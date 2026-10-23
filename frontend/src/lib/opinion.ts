import { OPINION_RANK } from './types'
import type { AuditYear, OpinionSeverity } from './types'

/**
 * Audit opinion wording and ranking.
 *
 * This lives in lib, not in the year-end route, for one reason: the
 * same words have to appear in the AGM report view and anywhere else
 * an opinion is shown, and two copies of this text would drift. The
 * wording is fixed by decision and confirmed with a practising
 * chartered accountant. It is not editorial.
 *
 * THE RULES, which the tests in opinion.test.ts hold:
 *
 *   - The auditor gives REASONABLE ASSURANCE, never a guarantee.
 *     Nothing here may say the auditor certified, verified or confirmed
 *     that the accounts are correct. Same force as "tamper-evident,
 *     never tamper-proof".
 *   - A DISCLAIMER outranks an ADVERSE opinion. A disclaimer means the
 *     auditor could not form an opinion at all, which is worse than
 *     forming a bad one.
 *   - A headline reads the MOST SERIOUS opinion ever received, never
 *     the "most adverse" — ambiguous under that ranking — and never
 *     the latest, because a clean year does not undo an earlier
 *     disclaimer.
 */

/**
 * Plain English for each opinion, in the auditor's actual terms.
 *
 * Every string says what the auditor did, or could not do. None says
 * the accounts are correct, and none says the auditor confirmed
 * anything.
 */
export function opinionWords(opinion: OpinionSeverity): string {
  switch (opinion) {
    case 'clean':
      return 'reasonable assurance that the accounts show a true and fair picture'
    case 'qualified':
      return 'reasonable assurance with an exception, which is described below'
    case 'adverse':
      return 'an adverse opinion: the accounts do not show a true and fair picture'
    case 'disclaimer':
      return 'a disclaimer of opinion: the auditor could not form an opinion at all, which is the most serious outcome'
  }
}

/**
 * The most serious opinion in the set, by the explicit ranking.
 *
 * Not the latest. A clean opinion this year does not undo a disclaimer
 * two years ago, and a headline showing only the latest would hide it.
 * Years with no opinion are skipped: an open year is not a clean one.
 */
export function worstOpinion(
  years: readonly AuditYear[],
): OpinionSeverity | undefined {
  let worst: OpinionSeverity | undefined
  let worstRank = -1

  for (const year of years) {
    if (!year.opinion) continue

    /*
     * Every candidate is ranked, including the first one.
     *
     * The bug this replaces: the guard read
     * `worst === undefined || RANK[year.opinion] > RANK[worst]`, and
     * the left side short-circuits, so the FIRST opinion in the array
     * was accepted without its rank ever being consulted. A value this
     * product does not rank - 'unqualified', the real-world term an
     * auditor's own system may send for what we call 'clean' - became
     * the headline when it arrived first and was silently skipped when
     * it arrived second. The headline therefore depended on array
     * order, and could print a word whose seriousness this code cannot
     * order against any other.
     *
     * An unranked value is dropped instead. That is the safe
     * direction: the headline can only ever be a severity whose place
     * in clean < qualified < adverse < disclaimer is known. It also
     * means an unrecognised value is INVISIBLE here, which is why the
     * wire contract for this field must be a closed enum and not free
     * text.
     */
    const rank = OPINION_RANK[year.opinion]
    if (typeof rank !== 'number') continue

    if (rank > worstRank) {
      worstRank = rank
      worst = year.opinion
    }
  }

  return worst
}

/**
 * Whether a year counts as closed.
 *
 * Closed means an AUDITOR SIGNED OFF. Not a date, not an admin action,
 * not the passage of time — the committee cannot close its own books.
 * A helper exists so no surface is tempted to compare a date against
 * today and call that closed.
 */
export function isClosed(year: AuditYear): boolean {
  // `!= null`, NOT `!== undefined`, and the loose operator is deliberate:
  // it is the one place in this file that catches both null and
  // undefined. JSON has no `undefined`, so a backend that serialises an
  // open year as `"closedAt": null` passes a `!== undefined` test and the
  // year reads as CLOSED — which would mean the product shows a resident
  // that an auditor signed off when no auditor has seen it, and blocks
  // reversals in a year that is still open. The type says `?: string`,
  // but the wire is what arrives.
  return year.closedAt != null
}

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
  for (const year of years) {
    if (!year.opinion) continue
    if (worst === undefined || OPINION_RANK[year.opinion] > OPINION_RANK[worst]) {
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
  return year.closedAt !== undefined
}

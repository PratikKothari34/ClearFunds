/*
 * THE HEADLINE OPINION, RECOMPUTED RATHER THAN TRUSTED.
 *
 * The report's audit chip, its hint line and the "governs" marker beside one
 * history entry all came straight from the server: `opinions.headline` and
 * `opinions.headline_seq`. The history is rendered directly below them, so
 * everything needed to check the claim was already on the screen and nothing
 * checked it.
 *
 * The rule is settled and it is not "the latest opinion". The headline is the
 * MOST SERIOUS opinion ever received - clean < qualified < adverse <
 * disclaimer, with a disclaimer worse than an adverse one, because the
 * auditor could not form an opinion at all. A server that took the most
 * RECENT instead would show a year that went adverse and was later revisited
 * as a clean audit, with the adverse entry listed underneath and nothing
 * saying the two disagree. `headline_seq` pointing at the wrong entry puts
 * "governs" on the opinion that does not.
 *
 * This is the same shape as every other parser in this directory: the premise
 * of the verifier is that what the server sends is recomputed, not trusted,
 * and a headline is a claim about the history sitting right beside it.
 *
 * It DISCLOSES a disagreement rather than silently substituting its own
 * answer. The view may legitimately return a shortened history - a page, a
 * filter - in which case the server's headline can be more serious than
 * anything shown, and that direction is not a defect. The other direction is:
 * a headline LESS serious than an opinion on screen cannot be right whatever
 * the server knows, because the worse opinion is right there.
 */
import { headlineOpinion } from './format'
import type { Opinion } from './types'

export type OpinionEntry = { seq: number; opinion: Opinion }

export type HeadlineCheck =
  /** Nothing to check: no opinion has been recorded for this year. */
  | { state: 'none' }
  /** The server's headline is the most serious opinion in the history. */
  | { state: 'agrees'; headline: Opinion }
  /**
   * An opinion on screen is MORE SERIOUS than the headline the server gave.
   * `worst` is what the visible history actually supports.
   */
  | { state: 'understated'; headline: Opinion | null; worst: Opinion }
  /**
   * The headline is at least as serious as everything shown but is not one of
   * the visible entries - consistent with a history this view did not return
   * in full, so it is reported separately and is not an understatement.
   */
  | { state: 'unverifiable'; headline: Opinion }

/**
 * Check a year's headline opinion against the history rendered beside it.
 *
 * An empty history with a headline is `unverifiable`, not `agrees`: there is
 * nothing on screen supporting it.
 */
export function checkHeadline(
  headline: Opinion | null | undefined,
  history: readonly OpinionEntry[],
): HeadlineCheck {
  const worst = headlineOpinion(history.map((h) => h.opinion))
  if (worst === null) return headline ? { state: 'unverifiable', headline } : { state: 'none' }
  // headlineOpinion of the pair is the more serious of the two. If that is
  // not the headline, something visible is worse than what was claimed.
  if (!headline || headlineOpinion([headline, worst]) !== headline) {
    return { state: 'understated', headline: headline ?? null, worst }
  }
  return history.some((h) => h.opinion === headline)
    ? { state: 'agrees', headline }
    : { state: 'unverifiable', headline }
}

/**
 * Which history entry governs, or null when the server's choice is not
 * supported by what is shown.
 *
 * The marker is only ever placed on an entry carrying the headline opinion.
 * A `headline_seq` pointing at a milder entry marks the wrong one, which is
 * worse than marking none: it tells a resident the clean opinion is the one
 * that counts.
 */
export function governingSeq(
  headline: Opinion | null | undefined,
  headlineSeq: number | null | undefined,
  history: readonly OpinionEntry[],
): number | null {
  if (!headline) return null
  const named = history.find((h) => h.seq === headlineSeq)
  if (named && named.opinion === headline) return named.seq
  // Fall back to the first entry that actually carries the headline opinion,
  // so the marker is still shown when only the seq is wrong.
  return history.find((h) => h.opinion === headline)?.seq ?? null
}

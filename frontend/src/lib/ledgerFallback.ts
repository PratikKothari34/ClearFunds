/**
 * What the product says when the history could not be read.
 *
 * ONE COPY, BECAUSE THE DANGEROUS EDIT IS THE PARTIAL ONE. This text
 * was written out identically in three route files - the ledger, its
 * flagged tab and its reversed tab. Nothing kept them in step, and the
 * failure mode is specific: someone shortens one of them, the other two
 * keep the full wording, and the tab that now says less is the tab a
 * resident happened to open.
 *
 * The sentence it must never lose is the second one. "Nothing is
 * listed" and "there are no entries" are the same screen and opposite
 * facts, and this product exists to let a resident tell the difference
 * — an empty ledger would mean a society that has recorded nothing,
 * which is the most alarming thing this page could say by accident.
 *
 * Not a component: `BandFallback` renders it, and three tabs pass
 * different `headingId`s to it. This is the words only.
 */
export const LEDGER_UNREACHED_HEADING = 'The history could not be loaded'

export const LEDGER_UNREACHED_EXPLANATION =
  'The ledger did not load, so nothing is listed below. This is not a statement that the society has no entries — it means the record was not reached. Nothing has been changed.'

/**
 * What to call a cancelled entry, and what cancelling it did.
 *
 * THE DETAIL PAGE CALLED EVERY CANCELLED ENTRY A PAYMENT. A society's
 * ledger carries money in as well as out - maintenance collected,
 * interest credited, a deposit returned - and on a cancelled receipt
 * the page read "This payment was cancelled. The money does not count
 * towards the society balance." Both halves are wrong in the same
 * direction: nothing was paid, and the money never arrived rather
 * than not counting.
 *
 * That matters beyond grammar. A resident reading a cancelled receipt
 * against their own flat needs to know whether a payment they made is
 * being treated as not received. "Payment" tells them the society
 * cancelled something it paid out, which is the opposite event.
 *
 * Both strings are derived from `direction`, so neither page can
 * state one and leave the other stale.
 */
export type Direction = 'in' | 'out'

/**
 * The noun for the entry itself.
 *
 * Plain words a resident uses, not `credit` and `debit`: this product
 * is read by people who have never used an accounting system, and the
 * whole point of the ledger is that they can check it themselves.
 */
export function cancelledNoun(direction: Direction): string {
  return direction === 'in' ? 'receipt' : 'payment'
}

/**
 * What the cancellation means for the balance, in the right direction.
 *
 * For money out, it was paid and then cancelled, so it no longer
 * counts against the society. For money in, the society is recording
 * that the amount is not treated as received. Saying "does not count
 * towards the balance" for a receipt is technically true and reads as
 * though the money is sitting somewhere uncounted.
 */
export function cancelledEffect(direction: Direction): string {
  return direction === 'in'
    ? 'This amount is not counted as received, so it is not part of the society balance.'
    : 'The money does not count towards the society balance.'
}

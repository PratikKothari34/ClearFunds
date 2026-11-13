/*
 * WITHDRAWING A PROPOSAL IS IRREVERSIBLE AND THROWS AWAY SIGNATURES.
 *
 * `api_withdraw` appends `proposal_closed` with reason `withdrawn`, and its
 * own precondition - `cf.proposal_status(...) <> 'open'` refuses - means it
 * can happen exactly once. There is no re-open path anywhere in the contract.
 * To get the entry back the proposer must raise a NEW proposal, which takes a
 * new sequence number and starts at zero approvals: every signature already
 * cast on the old one is gone and has to be collected again.
 *
 * On the approvals screen, Approve had a two-step confirm and Decline had a
 * sheet, while Withdraw - the only one of the three that cannot be undone -
 * fired on a single click straight into `mutateAsync`. On the seeded society,
 * the treasurer's open #4241 carried SIX approvals behind that one click.
 *
 * So the warning has to say what is actually lost, which means it depends on
 * the count, which makes it a decision and not a caption. It lives here to be
 * tested without mounting a router.
 *
 * WHY THE COUNT IS NOT TRUSTED BLINDLY. `approve_count` arrives from the
 * server and the signed-in device cannot recompute it. A read that failed or
 * a field a later contract stops sending must not become the sentence "No
 * approvals have been signed yet" - that is the `?? []` shape: a fallback
 * indistinguishable from a real answer, and here it would tell the proposer
 * nothing is at stake at the one moment that is false. An unreadable count
 * says so instead.
 */

/** What the confirmation tells the proposer they are about to lose. */
export type WithdrawStake =
  | { known: true; approvals: number; message: string }
  | { known: false; message: string }

/*
 * Not `count ?? 0`. A non-integer, a negative, a NaN or a missing field are
 * all "we do not know", and each would otherwise read as a confident zero.
 */
export function withdrawStake(count: unknown): WithdrawStake {
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    return {
      known: false,
      message:
        'This cannot be undone, and any approvals already signed on it are lost. Getting it back means proposing it again from scratch.',
    }
  }
  if (count === 0) {
    return {
      known: true,
      approvals: 0,
      message:
        'No approvals have been signed on it yet. This cannot be undone - getting it back means proposing it again, with a new entry number.',
    }
  }
  const sigs = count === 1 ? '1 approval already signed' : `${count.toLocaleString('en-IN')} approvals already signed`
  return {
    known: true,
    approvals: count,
    message:
      `This throws away the ${sigs} on it, and cannot be undone. Getting it back means proposing it again, with a new entry number, and collecting those ${count === 1 ? 'signature' : 'signatures'} again.`,
  }
}

import type { ApprovalPolicy, CommitteeSeat } from '../lib/types'
import { canReachQuorum, policyFault, signableSeats } from '../lib/quorum'

/**
 * The statutory committee roster and the threshold it answers to.
 *
 * WHY THIS SURFACE EXISTS: the approval queue tells an admin that an
 * expense needs eight signatures. It does not tell them who the eight
 * could be, or that three seats currently cannot sign. A committee
 * that cannot reach its own threshold looks, from the queue alone,
 * exactly like a committee that simply has not got round to it.
 *
 * SEATS, NOT PEOPLE. Every seat is listed including vacant ones,
 * because the denominator M is the statutory seat count and a
 * resignation does not lower it. Hiding empty seats would make the
 * roster look like the denominator, and a reader who counts the rows
 * would get the wrong M.
 *
 * Status is never carried by colour alone - each non-active seat
 * states its restriction in words.
 */
export function CommitteeRoster({
  roster,
  policy,
}: {
  readonly roster: readonly CommitteeSeat[]
  readonly policy: ApprovalPolicy
}) {
  const fault = policyFault(policy)

  /*
   * A FAULTED POLICY IS REPORTED, NEVER NARRATED. The figures below
   * read "8 of 11 signatures" as though that were the society's rule.
   * Printing a snapshot that claims less than two-thirds would be this
   * page stating a threshold the society never agreed to - the same
   * failure `approval.ts` exists to stop on the queue.
   */
  if (fault !== null) {
    return (
      <p className="m-0 font-label-code-sm text-label-code-sm text-on-error-container max-w-[68ch]">
        The approval rule recorded for this committee does not match the
        society&rsquo;s own minimum, so it is not shown here. Nothing is
        wrong with the entries in the ledger; what cannot be relied on is
        the rule this screen would otherwise state. Ask the committee to
        check it.
      </p>
    )
  }

  const signable = signableSeats(roster)
  const blocked = !canReachQuorum(roster, policy)

  return (
    <div>
      <p className="m-0">
        <span className="cf-tabular">{policy.quorumRequired}</span> of{' '}
        <span className="cf-tabular">{policy.seats}</span> seats must approve
        anything above the limit.
      </p>
      <p className="mt-space-sm mb-0 font-label-code-sm text-label-code-sm text-on-surface-variant max-w-[68ch]">
        That is two-thirds of the committee, rounded up. It is a floor: the
        committee can require more, never fewer.
      </p>

      {/*
        THE BLOCKED CASE IS STATED FIRST AND PLAINLY. It is not an
        empty queue and not a loading state — it is the committee
        unable to act at all, which nothing else on this screen would
        reveal.
      */}
      {blocked && (
        <p className="mt-space-md mb-0 text-on-error-container max-w-[68ch]">
          Only <span className="cf-tabular">{signable}</span>{' '}
          {signable === 1 ? 'seat holds' : 'seats hold'} a key that can sign
          right now, which is fewer than the{' '}
          <span className="cf-tabular">{policy.quorumRequired}</span> needed.
          Until that changes, no expense above the limit can be approved by
          anyone.
        </p>
      )}

      <ul className="list-none p-0 mt-space-lg mb-0">
        {roster.map((s) => (
          <li
            key={s.seat}
            className="flex items-baseline gap-space-md py-space-sm border-b border-outline-variant last:border-b-0"
          >
            <span className="cf-tabular font-label-code-sm text-label-code-sm text-on-surface-variant w-[2.5ch] shrink-0">
              {s.seat}
            </span>
            <span className="min-w-0 flex-1">
              {/*
                A vacant seat says so in the name position rather than
                rendering an empty cell — an empty cell in a roster
                reads as a row that failed to load.
              */}
              <span className={s.status === 'vacant' ? 'text-on-surface-variant' : ''}>
                {s.holderHandle ?? 'Seat vacant'}
              </span>
              {s.office && (
                <span className="font-label-code-sm text-label-code-sm text-on-surface-variant"> {s.office}</span>
              )}
              {s.status !== 'active' && (
                <span className="block font-label-code-sm text-label-code-sm text-on-tertiary-fixed-variant">
                  {/*
                    Never colour alone: the reason is the signal, the
                    colour only draws the eye to it.
                  */}
                  {s.restrictionReason ??
                    (s.status === 'vacant'
                      ? 'No sitting member. The seat still counts toward the total.'
                      : 'Cannot sign at present.')}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

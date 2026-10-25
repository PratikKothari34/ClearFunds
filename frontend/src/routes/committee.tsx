import { createFileRoute } from '@tanstack/react-router'
import { Band } from '../components/Band'
import { BandFallback } from '../components/BandFallback'
import { CommitteeRoster } from '../components/CommitteeRoster'
import { devCommittee, devPolicy } from '../lib/devData'
import { isOutstanding, isUnreadableAmount } from '../lib/countable'
import { formatMoney } from '../lib/money'

export const Route = createFileRoute('/committee')({
  component: Committee,
})

/**
 * Who sits on the committee, and what it takes to approve an expense.
 *
 * VISIBLE TO EVERY ROLE, DELIBERATELY - and that is a departure from
 * `/dues` and `/approvals`, which are gated. The composition of a
 * managing committee is a matter of statutory record that any member
 * may inspect, and the approval rule is the society's own rule. A
 * resident who cannot see the rule cannot tell whether it was
 * followed, which would hollow out the transparency the product is
 * for.
 *
 * What is NOT here: the queue itself. Who sits on the committee and
 * what the threshold is are public; which expenses are mid-approval,
 * with payees and amounts, is the committee's working state and stays
 * on `/approvals` behind its role check.
 */
function Committee() {
  const roster = devCommittee()
  const policy = devPolicy()

  return (
    <>
      <Band tone="primary">
        <h2 className="font-headline-md text-headline-md font-semibold mt-0 mb-space-sm">
          The committee
        </h2>
        <p className="m-0 text-on-surface-variant max-w-[68ch]">
          Every expense needs more than one person to approve it. This page
          shows who can approve, and how many of them it takes.
        </p>
      </Band>

      {/*
        ABSENT IS NOT EMPTY, and on this page the empty reading is
        alarming: a roster that failed to load rendering as "no seats"
        would tell a resident their society has no committee.
      */}
      {roster === null || policy === null ? (
        <BandFallback
          heading="The committee could not be loaded"
          headingId="cf-committee-absent"
          explanation="This did not load, so it is not shown. It does NOT mean the society has no committee or no approval rule — check again before drawing any conclusion from this page."
        />
      ) : (
        <>
          <Band heading="Approval rule" headingId="cf-committee-rule">
            <CommitteeRoster roster={roster} policy={policy} />
          </Band>

          <Band heading="The limit" headingId="cf-committee-limit">
            {/*
              PARTITIONED THREE WAYS, never `limit.minor === 0`.

              An unreadable limit is not a limit of zero, and the two
              have opposite meanings here: zero is the STRICTEST
              setting, where everything needs the full committee, and
              unreadable means we do not know what the rule is. A
              bare equality check answers false for junk, which drops
              an unknown rule into the lenient branch and prints a
              reassuring sentence about tiering that may be the
              reverse of the truth.
            */}
            {isUnreadableAmount(policy.limit) ? (
              <p className="m-0 text-on-error-container max-w-[68ch]">
                The limit could not be read, so it is not shown. This does NOT
                mean there is no limit — do not conclude anything about what
                an expense needs from this page until it loads.
              </p>
            ) : isOutstanding(policy.limit) ? (
              <>
                <p className="m-0">
                  <span className="cf-tabular">{formatMoney(policy.limit)}</span>
                </p>
                <p className="mt-space-sm mb-0 font-label-code-sm text-label-code-sm text-on-surface-variant max-w-[68ch]">
                  At or below this, an expense needs the treasurer and the
                  secretary — both of them. Above it, it needs the number of
                  committee members shown above. Changing this limit needs that
                  larger number too, so the committee cannot quietly lower the
                  bar for itself.
                </p>
              </>
            ) : (
              <>
                <p className="m-0">
                  <span className="cf-tabular">{formatMoney(policy.limit)}</span>
                </p>
                <p className="mt-space-sm mb-0 font-label-code-sm text-label-code-sm text-on-surface-variant max-w-[68ch]">
                  The limit is zero, so every expense needs the full number of
                  approvals shown above. This is the strictest setting, and it
                  is the one a society starts with.
                </p>
              </>
            )}
          </Band>
        </>
      )}
    </>
  )
}

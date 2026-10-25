import { formatMoney } from '../lib/money'
import { formatPostedAt } from '../lib/ledger'
import type { ReactNode } from 'react'
import { SAMPLE_LIMIT, type SampleAdmin } from '../lib/sample'

/*
 * THE COMMITTEE AND THE APPROVAL LIMIT.
 *
 * The export built this screen around device-held keys - "Apple Secure
 * Enclave", "Browser WebAuthn", "Bound Public Key". None of it applies:
 * keys are server-held, so there is nothing per-member to enrol, bind or
 * lose, and no key column to show.
 *
 * What IS shown is the pair of tiers and the floor under them, because the
 * invariant worth displaying is that no single admin moves the ledger
 * alone - the tier trades nine-of-thirteen for two-of-two, never for one.
 */
export function CommitteeRoster({
  members,
}: {
  members: readonly SampleAdmin[]
}) {
  const reachable = members.filter((m) => m.active).length

  return (
    <div className="flex flex-col gap-space-sm">
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        {/*
          Reachable, not "online". A member whose approval cannot currently
          be obtained still holds their role; the count is about whether a
          threshold can be met today, not about who is logged in.
        */}
        {reachable} of {members.length} can be reached for an approval today.
      </p>

      <ul className="flex flex-col divide-y divide-outline-variant">
        {members.map((m) => (
          <li
            key={m.name}
            className="flex flex-wrap items-baseline justify-between gap-space-sm py-space-sm"
          >
            <span className="font-body-md text-body-md text-on-surface">
              {m.name}
            </span>
            <span className="flex items-center gap-space-sm">
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {m.role}
              </span>
              {!m.active && (
                <span className="rounded bg-surface-container px-space-xs py-[2px] font-body-sm text-body-sm text-on-surface">
                  Cannot be reached
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LimitPanel({ limit }: { limit: typeof SAMPLE_LIMIT }) {
  const amount = formatMoney(limit.limit)
  const setAt = formatPostedAt(limit.setAt)

  return (
    <dl className="flex flex-col gap-space-sm">
      <Row
        term="The limit in force"
        detail={
          setAt === null
            ? 'Recorded in the chain, so an approval can be checked against the limit that applied when it was made.'
            : `Set on ${setAt.date} and recorded in the chain, so an approval can be checked against the limit that applied when it was made.`
        }
      >
        {amount ?? 'Could not be read'}
      </Row>

      <Row
        term="At or below the limit"
        detail="The treasurer and the secretary, both. Two people, never one, whatever the limit is set to."
      >
        {/*
          Spelled as "2 of 2" rather than a bare 2, so it reads the same
          way as the tier below it and the pair is visibly a threshold.
        */}
        {limit.atOrBelowNeeds} of {limit.atOrBelowNeeds}
      </Row>

      <Row
        term="Above the limit"
        detail="At least two-thirds of the committee, rounded up. The committee can set it higher; it cannot set it lower, and changing the limit itself needs this same majority."
      >
        {limit.aboveNeeds} of {limit.committeeSize}
      </Row>
    </dl>
  )
}

function Row({
  term,
  detail,
  children,
}: {
  term: string
  detail: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-space-xs rounded bg-surface-container-low p-space-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-space-sm">
        <dt className="font-body-md text-body-md font-semibold text-on-surface">
          {term}
        </dt>
        <dd className="cf-tabular font-tabular-currency-md text-tabular-currency-md font-semibold text-on-surface">
          {children}
        </dd>
      </div>
      <p className="font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
        {detail}
      </p>
    </div>
  )
}

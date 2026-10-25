import { classify, tally } from '../lib/countable'
import { formatMoney } from '../lib/money'
import { formatPostedAt } from '../lib/ledger'
import type { SampleFlat } from '../lib/sample'

/*
 * WHICH FLATS HAVE PAID - the screen `countable.ts` exists for.
 *
 * The original bug: `NaN > 0` is false, so a flat whose arrears figure
 * could not be read took the same branch as a flat that had paid in full.
 * The count came out TOO LOW, which told a treasurer to stop chasing.
 *
 * So nothing here decides from a raw `.minor`. Every row goes through
 * `classify`, which partitions THREE ways, and the unreadable count is
 * displayed even when it is zero - a count that silently omits it is the
 * bug, and a zero that is shown is the proof it was looked for.
 */
export function FlatMatrix({ flats }: { flats: readonly SampleFlat[] }) {
  const counts = tally(flats.map((f) => f.arrears))

  return (
    <div className="flex flex-col gap-space-md">
      {/*
        Three figures, always three. `owing + clear` deliberately need not
        equal `total`; the difference is the unreadable ones, and showing
        it is the whole point.
      */}
      <dl className="grid grid-cols-3 gap-space-sm">
        <Count label="Owing" value={counts.positive} />
        <Count label="Clear" value={counts.zeroOrNegative} />
        <Count
          label="Could not be read"
          value={counts.unreadable}
          /* Marked whenever it is non-zero: it is a to-do, not a statistic. */
          flagged={counts.unreadable > 0}
        />
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant">
              <Th>Flat</Th>
              <Th>Resident</Th>
              <Th align="right">Billed</Th>
              <Th align="right">Received</Th>
              <Th align="right">Outstanding</Th>
              <Th>Last paid</Th>
            </tr>
          </thead>
          <tbody>
            {flats.map((flat) => (
              <FlatRow key={flat.flat} flat={flat} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Count({
  label,
  value,
  flagged = false,
}: {
  label: string
  value: number
  flagged?: boolean
}) {
  return (
    <div
      className={
        flagged
          ? 'flex flex-col gap-space-xs rounded border border-outline bg-surface-container-low p-space-sm'
          : 'flex flex-col gap-space-xs rounded bg-surface-container-low p-space-sm'
      }
    >
      <dt className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline">
        {label}
      </dt>
      <dd className="cf-tabular font-tabular-currency-lg text-tabular-currency-lg font-semibold text-on-surface">
        {value}
      </dd>
    </div>
  )
}

function Th({
  children,
  align = 'left',
}: {
  children: string
  align?: 'left' | 'right'
}) {
  return (
    <th
      scope="col"
      className={
        align === 'right'
          ? 'px-space-xs py-space-sm text-right font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline'
          : 'px-space-xs py-space-sm font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline'
      }
    >
      {children}
    </th>
  )
}

function FlatRow({ flat }: { flat: SampleFlat }) {
  const outstanding = classify(flat.arrears)
  const lastPaid =
    flat.lastPaidAt === null ? null : formatPostedAt(flat.lastPaidAt)

  return (
    <tr className="border-b border-outline-variant/60">
      <td className="cf-tabular px-space-xs py-space-sm font-body-md text-body-md font-semibold text-on-surface">
        {flat.flat}
      </td>
      <td className="px-space-xs py-space-sm font-body-md text-body-md text-on-surface-variant">
        {flat.resident}
      </td>
      <Amount money={formatMoney(flat.billed)} />
      <Amount money={formatMoney(flat.received)} />
      <td className="cf-tabular px-space-xs py-space-sm text-right font-body-md text-body-md">
        {/*
          Three branches, matching the three answers. The unreadable case
          says so in words rather than rendering a dash, which would read
          as nothing owed.
        */}
        {outstanding.kind === 'unreadable' ? (
          <span className="font-semibold text-on-surface">
            Could not be read
          </span>
        ) : outstanding.kind === 'positive' ? (
          <span className="font-semibold text-on-surface">
            {formatMoney(outstanding.amount) ?? 'Could not be read'}
          </span>
        ) : (
          <span className="text-on-surface-variant">
            {formatMoney(outstanding.amount) ?? 'Could not be read'}
          </span>
        )}
      </td>
      <td className="px-space-xs py-space-sm font-body-sm text-body-sm text-on-surface-variant">
        {lastPaid === null ? 'Not recorded' : lastPaid.date}
      </td>
    </tr>
  )
}

function Amount({ money }: { money: string | null }) {
  return (
    <td className="cf-tabular px-space-xs py-space-sm text-right font-body-md text-body-md text-on-surface-variant">
      {money ?? 'Could not be read'}
    </td>
  )
}

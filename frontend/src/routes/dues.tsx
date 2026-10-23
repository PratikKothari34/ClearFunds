import { createFileRoute } from '@tanstack/react-router'
import { Amount } from '../components/Amount'
import { Band } from '../components/Band'
import { SAMPLE_DUES } from '../lib/sample'

export const Route = createFileRoute('/dues')({
  component: Dues,
})

/**
 * Maintenance dues by flat. Treasurer and secretary only.
 *
 * This is the one surface in the product where a resident's flat sits
 * next to a number they would not want published, so it is never part
 * of a resident payload at all — not hidden, absent. Residents see
 * their own position on their own flat page.
 *
 * A real table here, unlike the ledger: the rows are homogeneous, short
 * and compared column against column, which is exactly what a table is
 * for. The ledger is not that, which is why it is not one.
 *
 * Every figure is the server's. Outstanding is NOT billed minus paid
 * computed here — part payments, waivers and interest make that
 * subtraction wrong, and a wrong figure against a neighbour's flat
 * number is the worst kind to get wrong.
 */
function Dues() {
  const rows = SAMPLE_DUES
  const owing = rows.filter((r) => r.outstanding.minor > 0)

  return (
    <>
      <Band>
        <h2 className="font-serif text-head font-normal mt-0 mb-(--cf-s1)">
          Maintenance dues
        </h2>
        <p className="m-0 text-ink-quiet max-w-[68ch]">
          <span className="cf-tabular">{owing.length}</span> of{' '}
          <span className="cf-tabular">{rows.length}</span>{' '}
          {rows.length === 1 ? 'flat has' : 'flats have'} something
          outstanding. Residents see only their own flat.
        </p>
      </Band>

      <Band heading="By flat" headingId="cf-dues-table">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="cf-sr-only">
              Maintenance billed, paid and outstanding for each flat
            </caption>
            <thead>
              <tr className="border-b border-rule">
                <th scope="col" className="py-(--cf-s1) pr-(--cf-s3) font-medium">
                  Flat
                </th>
                <th
                  scope="col"
                  className="py-(--cf-s1) pr-(--cf-s3) font-medium text-right"
                >
                  Billed
                </th>
                <th
                  scope="col"
                  className="py-(--cf-s1) pr-(--cf-s3) font-medium text-right"
                >
                  Paid
                </th>
                <th
                  scope="col"
                  className="py-(--cf-s1) font-medium text-right"
                >
                  Outstanding
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.flat} className="border-b border-rule last:border-b-0">
                  {/* scope=row: the flat is what identifies the line. */}
                  <th
                    scope="row"
                    className="py-(--cf-s2) pr-(--cf-s3) font-normal cf-tabular whitespace-nowrap"
                  >
                    {row.flat}
                  </th>
                  <td className="py-(--cf-s2) pr-(--cf-s3) text-right">
                    <Amount value={row.billed} />
                  </td>
                  <td className="py-(--cf-s2) pr-(--cf-s3) text-right">
                    <Amount value={row.paid} />
                  </td>
                  <td className="py-(--cf-s2) text-right">
                    {row.outstanding.minor > 0 ? (
                      // --attention, not --break. Being behind on
                      // maintenance is something to chase, not a fault
                      // in the record.
                      <span className="text-attention">
                        <Amount value={row.outstanding} />
                      </span>
                    ) : (
                      <span className="text-ink-quiet">
                        <Amount value={row.outstanding} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Band>
    </>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { Amount } from '../components/Amount'
import { Band } from '../components/Band'
import { BandFallback } from '../components/BandFallback'
import { devDues } from '../lib/devData'
import { canSeeAllDues, duesVisibilitySentence } from '../lib/identity'
import { useViewerRole } from '../lib/viewer'
import { Link } from '@tanstack/react-router'

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
 * THE ROLE CHECK IS NOT DECORATION. This page carried the sentence
 * "Residents see only their own flat" while having no check at all:
 * viewing it as a resident rendered every flat's arrears under a line
 * promising the opposite. `nav.ts` filters the menu, and says in its
 * own header that its filtering is cosmetic and nothing in it is a
 * permission check — a URL typed by hand skips the menu entirely.
 *
 * The client check is depth. The server must refuse the payload: a
 * resident who edits their own bundle still must not be able to make
 * the table arrive.
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
  const role = useViewerRole()
  const rows = devDues()

  /*
   * Absent, not empty. An empty dues table means every flat has paid
   * — the figure a treasurer chases arrears from. A failed read
   * showing it would have the treasurer stop chasing.
   *
   * Checked AFTER the role gate below in intent but before any row is
   * read, so the order here is: no data, then not permitted. Both
   * return before the table is built.
   */
  if (rows === null) {
    return (
      <BandFallback
        heading="Dues could not be loaded"
        headingId="cf-dues-absent"
        explanation="The by-flat dues did not load, so no figures are shown. This is NOT a statement that every flat has paid. Nothing has been recorded or marked paid."
      />
    )
  }

  const owing = rows.filter((r) => r.outstanding.minor > 0)

  /*
   * Checked before any row is read, so a resident never reaches the
   * table-building code at all. Points at their own flat rather than
   * reading as a dead end: the figure they actually want is one tap
   * away, and a bare "not allowed" invites them to ask an admin to
   * screenshot it.
   */
  if (!canSeeAllDues(role)) {
    return (
      <Band>
        <h2 className="font-serif text-head font-normal mt-0 mb-(--cf-s1)">
          Dues by flat are not shown here
        </h2>
        <p className="m-0 text-ink-quiet max-w-[68ch]">
          What each flat owes is visible only to {duesVisibilitySentence()},
          who collect it. Your own flat&rsquo;s position is on{' '}
          <Link to="/my-flat" className="underline">
            your flat page
          </Link>
          .
        </p>
      </Band>
    )
  }

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
        {/*
          A SCROLLABLE REGION A KEYBOARD CANNOT REACH IS A HIDDEN
          COLUMN. This was a bare `overflow-x-auto` div: on a narrow
          phone the Outstanding column - the only column a treasurer
          opens this page for - sits off the right edge, and a div with
          no tab stop cannot be scrolled by keyboard at all. A mouse
          user drags it, a touch user swipes it, a keyboard user is
          simply told less.

          `tabIndex={0}` with `role="region"` and a name, which is the
          combination that makes it both reachable and announced; a tab
          stop with no name is an unexplained stop on the way to the
          table.

          No focus class here: `index.css` already gives every
          `:focus-visible` a 2px `--cf-anchor` outline, and a second
          per-element rule is how the two drift apart.
        */}
        <div
          className="overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-labelledby="cf-dues-table"
        >
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

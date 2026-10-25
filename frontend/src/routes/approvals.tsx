import { createFileRoute } from '@tanstack/react-router'
import { Band } from '../components/Band'
import { ApprovalItem } from '../components/ApprovalItem'
import { BandFallback } from '../components/BandFallback'
import { devApprovals } from '../lib/devData'
import { canSeeApprovalQueue } from '../lib/identity'
import { useViewerRole } from '../lib/viewer'

export const Route = createFileRoute('/approvals')({
  component: Approvals,
})

/**
 * Entries waiting on approval.
 *
 * The design rule that shapes this page: every item states WHY it needs
 * the approvals it needs, against the limit that was in force when it
 * was raised. An approval count with no explanation reads as an
 * arbitrary gate, and an admin who does not understand the gate treats
 * it as an obstacle instead of a safeguard.
 *
 * The approval count and tier come from the server, snapshotted into
 * the chain when the entry was raised. They are never computed here,
 * and never read from live settings: a committee that could lower the
 * limit afterwards could retroactively legitimise an approval already
 * given.
 *
 * Each item renders through `ApprovalItem`, which is a COMPONENT
 * rather than a function in this file because the rule it carries -
 * that nothing may narrate an approval reduced to one person - has to
 * be testable, and `autoCodeSplitting` makes a route component
 * unrenderable in a test.
 *
 * What this page still owns: who may see the queue at all, and the
 * absent-versus-empty distinction below.
 */
function Approvals() {
  const role = useViewerRole()
  const pending = devApprovals()

  /*
   * Checked before the list is read, because `nav.ts` omitting the
   * item is COSMETIC by its own admission and a typed URL skips the
   * menu. What this page puts on screen is every payee, narration and
   * amount one signature short, the limit in force, and who raised it
   * - the committee's working state, not the record.
   */
  if (!canSeeApprovalQueue(role)) {
    return (
      <Band>
        <h2 className="font-headline-md font-headline-md text-headline-md font-normal mt-0 mb-space-sm">
          The approval queue is not shown here
        </h2>
        <p className="m-0 text-on-surface-variant max-w-[68ch]">
          Expenses waiting for approval are visible to the committee members
          who approve them. Everything that has been approved is in the
          ledger, with who approved it and when.
        </p>
      </Band>
    )
  }

  /*
   * ABSENT IS NOT EMPTY. "Nothing is waiting for approval." is a
   * statement that the committee is clear — the single sentence a
   * treasurer would act on by closing the page. A failed read must
   * never produce it: an expense needing a signature would sit
   * invisible while the product said there was nothing to do.
   */
  if (pending === null) {
    return (
      <BandFallback
        heading="Pending approvals could not be loaded"
        headingId="cf-approvals-absent"
        explanation="This list did not load, so it is not shown. It does NOT mean nothing is waiting for approval — check again before assuming the committee is clear. Nothing has been approved or recorded."
      />
    )
  }

  return (
    <>
      <Band>
        <h2 className="font-headline-md font-headline-md text-headline-md font-normal mt-0 mb-space-sm">
          Waiting for approval
        </h2>
        <p className="m-0 text-on-surface-variant max-w-[68ch]">
          Nothing is recorded in the ledger until it has the approvals it
          needs. No single person can approve an expense alone.
        </p>
      </Band>

      {pending.length === 0 ? (
        <Band>
          <p className="m-0 text-on-surface-variant max-w-[68ch]">
            Nothing is waiting for approval.
          </p>
        </Band>
      ) : (
        pending.map((item) => <ApprovalItem key={item.id} item={item} />)
      )}
    </>
  )
}

import { Link } from '@tanstack/react-router'
import type { Role } from '../lib/types'
import { navFor, navGroupsFor } from '../lib/nav'
import { NavBadge } from './NavBadge'
import { Icon } from './Icon'

/**
 * The left rail: the Stitch export's `aside`, with our navigation in it.
 *
 * THE SKELETON IS VERBATIM. `fixed left-0 top-20 bottom-0 w-64
 * bg-surface-container-lowest z-40 flex flex-col justify-between
 * py-space-md`, the two labelled groups, and the status card pinned at
 * the bottom behind a `border-t`. The item markup - the icon, the
 * label, the right-aligned badge, the active treatment - is the
 * export's class list unchanged.
 *
 * WHAT CHANGED, AND WHY.
 *
 * 1. THE GROUPS ARE DERIVED FROM THE ROLE, not hardcoded. The export
 *    lists seven fixed links; this product shows a resident four items
 *    and a president seven, and showing a resident an "Approval Desk"
 *    they cannot use is how a read-only audience learns the product is
 *    not for them. Role filtering here is COSMETIC - the server
 *    refuses hidden surfaces to direct requests.
 *
 * 2. BELOW `md` IT IS HIDDEN AND BECOMES A DRAWER. The export has no
 *    mobile layout: this element is `fixed w-64` at every width, which
 *    on a phone covers two-thirds of the screen permanently. Hidden by
 *    default under `md`, opened by the header control.
 *
 * 3. THE STATUS CARD REPORTS WHAT WE CAN CHECK. The export's card
 *    claims "NODE PEERS 4 / 4 ONLINE" over a hash and a statute
 *    reference. There are no peers - this is a server-held chain with
 *    a published head, not a distributed network - so a peer count is
 *    a claim the product cannot support. See `RailStatus` below.
 */

export function DesktopRail({
  role,
  counts,
  open = false,
  onNavigate,
}: {
  readonly role: Role
  readonly counts: Readonly<Record<string, number>>
  /** Drawer state. Ignored at `md` and up, where the rail is static. */
  readonly open?: boolean
  readonly onNavigate?: () => void
}) {
  const groups = navGroupsFor(role)

  return (
    <aside
      id="cf-rail"
      /*
       * `md:translate-x-0` wins over the mobile transform at the
       * breakpoint, so the desktop rail is never affected by drawer
       * state. The transition is suppressed globally under
       * prefers-reduced-motion.
       */
      className={`fixed left-0 top-20 bottom-0 w-64 bg-surface-container-lowest z-40 flex flex-col justify-between py-space-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] overflow-y-auto transition-transform md:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
      aria-hidden={undefined}
    >
      <div className="flex flex-col gap-space-lg px-space-md">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col">
            <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline px-space-sm mb-space-xs">
              {group.label}
            </span>
            <nav aria-label={group.label} className="flex flex-col gap-space-xs">
              {group.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  activeOptions={{ exact: item.to === '/' }}
                  /*
                   * `min-h-11` is OURS, not the export's: 44px is the
                   * tap-target floor and the export's `py-space-xs`
                   * row is 30px tall. It is not a performance setting
                   * and does not move with the design.
                   */
                  className="flex items-center justify-between gap-space-sm min-h-11 px-space-sm py-space-xs rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors font-body-md text-body-md aria-[current=page]:bg-surface-container aria-[current=page]:text-on-surface aria-[current=page]:font-semibold"
                >
                  <span className="flex items-center gap-space-sm min-w-0">
                    <Icon name={item.icon} size={18} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <NavBadge count={counts[item.to]} label={item.label} />
                </Link>
              ))}
            </nav>
          </div>
        ))}
      </div>

      <RailStatus />
    </aside>
  )
}

/**
 * The status card at the foot of the rail.
 *
 * THE EXPORT'S VERSION CLAIMS THINGS THIS PRODUCT CANNOT CHECK, and
 * each one is the kind of claim the trust model exists to avoid:
 *
 *   "NODE PEERS 4 / 4 ONLINE" - there are no peers. The chain is
 *   server-held and its head is published outside admin control. A
 *   peer count implies a distributed network that would make tampering
 *   impossible, which is precisely the stronger claim we refuse to
 *   make.
 *
 *   "Sync: Maharashtra Co-Op Sec.79" - the statute governs inspection
 *   of records. Printing it as a sync target states the product is
 *   certified against it by some authority. Nobody certified anything.
 *
 * What the rail CAN honestly show is the published chain head, which is
 * the thing a resident can take elsewhere and check. The wording is
 * "last published", a timestamp, not a status word - a status word
 * invites the reader to stop reading, and this band's whole job is to
 * be checkable.
 *
 * The real values arrive from the server at cutover. Until then the
 * card renders its own absence rather than a plausible hash: a
 * fabricated "9bc4...091e" is indistinguishable from a real one, and
 * someone will screenshot it.
 */
function RailStatus() {
  return (
    <div className="px-space-md pt-space-md border-t border-surface-container-high">
      <div className="bg-surface-container-low p-space-sm rounded flex flex-col gap-space-xs">
        <div className="flex items-center justify-between text-on-surface-variant">
          <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider">
            Record check
          </span>
        </div>
        <p className="font-body-sm text-body-sm text-outline leading-snug">
          The published fingerprint is shown on the dashboard, with the
          date it was last published.
        </p>
        <Link
          to="/verify"
          className="font-label-code-sm text-label-code-sm text-on-surface hover:underline inline-flex items-center gap-space-xs min-h-11 md:min-h-0"
        >
          Check this ledger
          <Icon name="arrow_forward" size={14} />
        </Link>
      </div>
    </div>
  )
}

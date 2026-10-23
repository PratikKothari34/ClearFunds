import { Link } from '@tanstack/react-router'
import type { Role } from '../lib/types'
import { navFor } from '../lib/nav'
import { NavBadge } from './NavBadge'

/**
 * The left rail, 768px and up.
 *
 * Every item for the role, always, with no overflow and no collapse
 * control. There is room for six items on a desktop viewport, so the
 * mobile `More` grouping does not apply here — the rail shows the
 * unsplit list deliberately, not by omission.
 *
 * `sticky top-0 h-dvh` keeps it in place while the ledger scrolls. The
 * ledger is the long scroll in this product and losing the navigation
 * at row 400 is how a volunteer ends up using the browser back button
 * as navigation.
 */

export function DesktopRail({
  role,
  counts,
}: {
  readonly role: Role
  readonly counts: Readonly<Record<string, number>>
}) {
  const items = navFor(role)

  return (
    <nav
      aria-label="Main"
      className="hidden md:flex md:flex-col w-56 shrink-0 sticky top-0 h-dvh border-r border-rule px-(--cf-s2) py-(--cf-s3)"
    >
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              activeOptions={{ exact: item.to === '/' }}
              className="flex items-center justify-between gap-(--cf-s2) min-h-11 px-(--cf-s2) rounded-sm text-ink-quiet aria-[current=page]:text-ink aria-[current=page]:font-medium aria-[current=page]:bg-ink/5"
            >
              <span>{item.label}</span>
              <NavBadge count={counts[item.to] ?? 0} label={item.label} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

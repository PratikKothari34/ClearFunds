import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { LEDGER_TABS } from '../lib/nav'

export const Route = createFileRoute('/ledger')({
  component: LedgerLayout,
})

/**
 * The ledger's own layout: a heading and the three second-level tabs.
 *
 * Second level is tabs within the page, never a nested menu. A nested
 * menu hides a filter behind a tap, and a resident who cannot see that
 * a filter exists reads a filtered ledger as the whole ledger.
 */
function LedgerLayout() {
  return (
    <>
      <h2 className="font-headline-md font-headline-md text-headline-md font-normal pt-space-xl mb-space-md">
        History
      </h2>

      {/*
       * A real tab list. role="tablist" is deliberately NOT used: these
       * are links that change the route, and announcing them as tabs
       * promises a tab widget's keyboard model (arrow keys, one stop in
       * the tab order) that links do not implement.
       */}
      <nav aria-label="Filter history" className="flex gap-space-md border-b border-outline-variant">
        {LEDGER_TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: true }}
            className="min-h-11 inline-flex items-center px-space-sm -mb-px border-b-2 border-transparent text-on-surface-variant aria-[current=page]:border-primary-container aria-[current=page]:text-on-surface aria-[current=page]:font-medium"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </>
  )
}

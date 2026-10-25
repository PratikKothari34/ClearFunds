import { useState, type ReactNode } from 'react'
import type { Viewer } from '../lib/types'
import { MobileTabBar } from './MobileTabBar'
import { DesktopRail } from './DesktopRail'
import { ThemeToggle } from './ThemeToggle'
import { Icon } from './Icon'

/**
 * The frame every signed-in screen sits in.
 *
 * THE SKELETON IS THE STITCH EXPORT'S, VERBATIM. A fixed `h-20` header
 * across the top, a fixed `w-64` rail below it, and a `pl-64` main
 * column holding a `max-w-7xl` content stack. The class names are the
 * ones in `code.html` and the structure is not reinterpreted.
 *
 * WHAT THE EXPORT DOES NOT HAVE, AND WHY IT IS ADDED HERE.
 *
 * The export has no mobile layout at all. Its `aside` is
 * `fixed left-0 w-64` unconditionally and its main column is `pl-64`
 * unconditionally, with no breakpoint prefix on either and no menu
 * control anywhere in the markup. On a 360px phone that is a sidebar
 * covering two-thirds of the screen and a content column pushed almost
 * entirely off it.
 *
 * Residents are the largest audience for this product and they read it
 * on a phone, so the rail is hidden below `md` and the bottom tab bar
 * returns in its place. The desktop skeleton is untouched: at `md` and
 * above the DOM is the export's.
 *
 * `counts` drives both the badges and which items earn a mobile tab
 * slot. The ROOT ROUTE supplies it - from the fixture in development,
 * from `countsFor` otherwise - and `DashboardData` does NOT carry it.
 * At cutover it needs its own figures from the server, so the bar does
 * not cost a request of its own.
 */

export interface AppShellProps {
  readonly viewer: Viewer
  /**
   * Keyed by route. An ABSENT key renders no badge; a zero would
   * claim nothing is waiting, which is a different statement.
   */
  readonly counts?: Readonly<Record<string, number>>
  readonly children: ReactNode
}

export function AppShell({ viewer, counts = {}, children }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <>
      <Header
        viewer={viewer}
        navOpen={navOpen}
        onToggleNav={() => setNavOpen((v) => !v)}
      />

      <DesktopRail
        role={viewer.role}
        counts={counts}
        open={navOpen}
        onNavigate={() => setNavOpen(false)}
      />

      {/*
       * `pl-64` from the export, but only from `md` up - below it the
       * rail is out of flow and the column must have the full width.
       *
       * `pb-24` on mobile clears the fixed tab bar. Without it the last
       * ledger row sits under the bar and cannot be tapped - the kind
       * of defect that only shows at the bottom of a long list.
       */}
      <div className="md:pl-64">
        <main
          id="cf-main"
          className="w-full pt-20 p-gutter md:p-space-lg pb-24 md:pb-space-xl bg-surface min-h-screen"
        >
          <div className="flex flex-col w-full max-w-7xl mx-auto gap-space-lg">
            {children}
          </div>
        </main>
      </div>

      <MobileTabBar role={viewer.role} counts={counts} />
    </>
  )
}

/**
 * The fixed header: product mark, society name, then the controls.
 *
 * The society name is here on every screen because a treasurer who
 * manages two societies must never approve against the wrong ledger,
 * and the only moment they can catch that is before they tap.
 *
 * The theme control lives in the header rather than a settings page:
 * someone reading outdoors needs it where they are.
 *
 * THE EXPORT'S HEADER CARRIES A PHOTO AND A NAMED USER. That is
 * dropped. The avatar was a `lh3.googleusercontent.com` URL, which the
 * CSP blocks and which would be a third party learning when every
 * resident opens their society accounts; the name beside it was
 * invented. The role is what the header actually needs to show, since
 * it is what decides whether an Approve button appears.
 */
function Header({
  viewer,
  navOpen,
  onToggleNav,
}: {
  readonly viewer: Viewer
  readonly navOpen: boolean
  readonly onToggleNav: () => void
}) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-primary-container text-on-primary shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="h-20 w-full px-gutter md:px-gutter-lg flex items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-sm min-w-0">
          {/*
           * The menu control exists only below `md`, where the rail is
           * hidden. Above it the rail is always visible and never
           * collapses - a rail that collapses teaches a volunteer to
           * hunt for the thing they use every month.
           */}
          <button
            type="button"
            onClick={onToggleNav}
            aria-expanded={navOpen}
            aria-controls="cf-rail"
            className="md:hidden inline-flex items-center justify-center min-h-11 min-w-11 -ml-space-sm rounded-lg text-on-primary hover:bg-on-primary/10 transition-colors"
          >
            <Icon name={navOpen ? 'close' : 'menu'} />
            <span className="cf-sr-only">
              {navOpen ? 'Close menu' : 'Open menu'}
            </span>
          </button>

          <div className="min-w-0">
            <p className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-on-primary-container">
              ClearFunds
            </p>
            {/*
             * truncate, not wrap: a long society name must not push the
             * controls off the row at 320px.
             */}
            <h1 className="font-headline-sm text-headline-sm text-on-primary truncate">
              {viewer.societyName}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-space-sm shrink-0">
          <span className="hidden sm:inline-flex items-center font-label-code-sm text-label-code-sm uppercase tracking-wider text-on-primary-container px-space-sm py-1 rounded border border-on-primary/20">
            {viewer.role}
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

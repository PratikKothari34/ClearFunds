import type { ReactNode } from 'react'
import type { Viewer } from '../lib/types'
import { MobileTabBar } from './MobileTabBar'
import { DesktopRail } from './DesktopRail'
import { ThemeToggle } from './ThemeToggle'
import { LanguageSwitch } from './LanguageSwitch'

/**
 * The frame every signed-in screen sits in.
 *
 * Two navigation surfaces, never both visible: a bottom tab bar under
 * 768px and a left rail at or above it. They are rendered together and
 * hidden by media query rather than swapped on a JS breakpoint, because
 * a breakpoint read in JS is wrong on the first paint and the bar would
 * appear a frame late.
 *
 * Neither collapses and there is no hamburger. A rail that collapses
 * teaches a volunteer to hunt for the thing they use every month.
 *
 * `counts` drives both the badges and which items earn a mobile tab
 * slot. It comes from the dashboard payload, so the bar does not cost a
 * request of its own.
 */

export interface AppShellProps {
  readonly viewer: Viewer
  /** Keyed by route, from the dashboard payload. Absent means zero. */
  readonly counts?: Readonly<Record<string, number>>
  readonly children: ReactNode
}

export function AppShell({ viewer, counts = {}, children }: AppShellProps) {
  return (
    <div className="min-h-dvh flex flex-col md:flex-row">
      <DesktopRail role={viewer.role} counts={counts} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header viewer={viewer} />

        {/*
         * pb-20 on mobile clears the fixed tab bar. Without it the last
         * ledger row sits under the bar and cannot be tapped — the kind
         * of defect that only shows at the bottom of a long list.
         */}
        <main
          id="cf-main"
          className="flex-1 px-(--cf-gutter) pb-20 md:pb-8 md:px-8 max-w-[70rem] w-full"
        >
          {children}
        </main>
      </div>

      <MobileTabBar role={viewer.role} counts={counts} />
    </div>
  )
}

/**
 * Society name beside the product name, then language and theme.
 *
 * The society name is here on every screen because a treasurer who
 * manages two societies must never approve against the wrong ledger,
 * and the only moment they can catch that is before they tap.
 *
 * Both controls live in the header rather than a settings page. Someone
 * reading outdoors needs the theme where they are, and someone who
 * cannot read the English chrome cannot navigate to a settings page to
 * fix it.
 */
function Header({ viewer }: { readonly viewer: Viewer }) {
  return (
    <header className="flex items-center gap-(--cf-s2) px-(--cf-gutter) md:px-8 py-(--cf-s2) border-b border-rule">
      <div className="flex-1 min-w-0">
        <p className="text-meta text-ink-quiet leading-none">ClearFunds</p>
        {/*
         * truncate, not wrap: a long society name must not push the
         * theme toggle off the row at 320px.
         */}
        <h1 className="font-serif text-head leading-tight truncate">
          {viewer.societyName}
        </h1>
      </div>
      <LanguageSwitch />
      <ThemeToggle />
    </header>
  )
}

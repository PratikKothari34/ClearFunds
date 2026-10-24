import { useState } from 'react'
import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'
import { Hero } from '../components/Hero'
import { RoleSwitch } from '../components/RoleSwitch'
import { countsFor } from '../lib/counts'
import { devCounts } from '../lib/devCounts'
import { useBoot } from '../lib/useBoot'
import { ViewerFlatContext, ViewerRoleContext } from '../lib/viewer'
import {
  PLACEHOLDER_ROLE,
  placeholderViewer,
} from '../lib/placeholder'
import type { Role } from '../lib/types'

export const Route = createRootRoute({
  component: RootLayout,
})

/**
 * Routes that render without the shell.
 *
 * A signed-out screen must not show navigation. Nav items are derived
 * from a role, and a role implies a session — rendering the rail on the
 * login screen would mean inventing one, and the invented one is the
 * placeholder, which is a treasurer. A resident who is not signed in
 * would see a treasurer's menu.
 */
const BARE_ROUTES = ['/login']

function RootLayout() {
  const boot = useBoot()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [role, setRole] = useState<Role>(PLACEHOLDER_ROLE)
  const viewer = placeholderViewer(role)

  /*
   * The hero holds the first paint only until the shell and the ledger
   * head are ready — never until the published fingerprint resolves.
   * That check is cross-origin and the slowest thing on the screen, and
   * the fingerprint band carries its own pending state.
   *
   * A boot failure shows the hero in its failed phase rather than an
   * empty shell: an empty dashboard reads as a society with no money.
   */
  if (boot !== 'ready') {
    /*
     * `boot-failed`, not the hero's anchor phase. `useBoot`'s `failed`
     * means the boot fetch failed, which is a different fact from the
     * published record being unreachable — and this branch returns the
     * hero INSTEAD of the shell, so there is no ledger behind it. The
     * anchor copy would claim the history is on screen while the
     * history is exactly what is missing.
     */
    return <Hero phase={boot === 'failed' ? 'boot-failed' : 'loading'} />
  }

  // Bare routes render themselves whole, including their own <main>.
  if (BARE_ROUTES.includes(pathname)) {
    return <Outlet />
  }

  return (
    /*
      The role provider wraps the whole shell, because the surfaces that
      branch on it are nested several levels down — the disputes list and
      an entry's question log both decide whether to show who asked.

      Deliberately NOT wrapped around the bare-route branch above. That
      branch returns before this point, so /login gets the context
      default, which is `resident` — the least privileged role. A screen
      rendered outside the provider hides identities instead of showing
      them, so forgetting the provider is never the leak.
    */
    <ViewerRoleContext.Provider value={role}>
      {/*
        The flat is provided from the same viewer object the shell is
        given, so the page that renders "Your flat" and the heading
        that names the society cannot disagree about who is looking.

        `viewer.flat` is present only when the role is `resident`, so
        every other role gets `undefined` and `/my-flat` renders its
        "no flat is linked" band. That is the honest answer for an
        auditor, who has no flat at all.
      */}
      <ViewerFlatContext.Provider value={viewer.flat}>
      {/*
        The first focusable thing on the page. A resident using a
        keyboard or a screen reader should not have to walk the whole
        navigation to reach the balance they came for.

        cf-sr-only, not Tailwind's sr-only: the project has one
        visually-hidden implementation and it is the one the reversed
        entry depends on, so having two invites them to drift.
      */}
      <a
        href="#cf-main"
        className="cf-sr-only focus:static focus:w-auto focus:h-auto focus:m-0 focus:overflow-visible focus:[clip-path:none] focus:inline-block focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-surface focus:px-4 focus:py-2 focus:text-ink focus:border focus:border-rule"
      >
        Skip to content
      </a>

      {/*
        Badge figures come from the fixtures in development and from
        nothing at all in a production build, which is why the gate is
        here rather than inside countsFor.

        A BRANCH DOES NOT REMOVE AN IMPORT, and this gate alone would
        not keep the fixture out. `import.meta.env.DEV` is replaced by a
        literal and the dead branch is dropped, but the import is
        hoisted before that happens, so the module stays in the graph
        and its strings stay in the chunk. What actually keeps the
        fixture — every flat's questions and dues — out of a production
        build is the `resolve.alias` in vite.config.ts, which swaps
        `./devData.source` for an empty module. The gate here is so the
        dev path reads fixtures and the production path does not call
        into them at all; check-fixtures.mjs is what proves the result.

        countsFor with no sources returns an empty map, and an absent
        figure renders no badge rather than a zero: a zero claims
        nothing is waiting.
      */}
      <AppShell
        viewer={viewer}
        counts={import.meta.env.DEV ? devCounts(role) : countsFor(role)}
      >
        {/*
          Development only, and compiled out of a production build
          entirely rather than hidden. It sits inside the shell so the
          navigation it changes is visible in the same viewport.
        */}
        <RoleSwitch role={role} onChange={setRole} />
        <Outlet />
      </AppShell>
      </ViewerFlatContext.Provider>
    </ViewerRoleContext.Provider>
  )
}

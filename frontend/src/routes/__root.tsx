import { useState } from 'react'
import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'
import { Hero } from '../components/Hero'
import { RoleSwitch } from '../components/RoleSwitch'
import { countsFor } from '../lib/counts'
import { devCounts } from '../lib/devCounts'
import { useBoot } from '../lib/useBoot'
import { ViewerRoleContext } from '../lib/viewer'
import type { Role, Viewer } from '../lib/types'

export const Route = createRootRoute({
  component: RootLayout,
})

/*
 * Standing in for the authenticated viewer until the session endpoint
 * exists. It is declared here, once, so there is exactly one place to
 * delete when the real one lands — a placeholder copied into each route
 * is a placeholder that survives the cutover.
 *
 * Role is `treasurer` deliberately: it is the only role whose item list
 * overflows the mobile bar, so developing against it keeps the overflow
 * path visible instead of discovered later.
 */
const PLACEHOLDER_ROLE: Role = 'treasurer'

/**
 * A flat number belongs to a resident and to nobody else.
 *
 * The type makes `flat` optional because an auditor has none, and the
 * rule behind that is the one that shapes every payload here: a field a
 * viewer may not see is ABSENT, not present-and-hidden. Building the
 * placeholder the same way means switching to the auditor view actually
 * exercises the missing-flat path, rather than passing a flat that the
 * auditor's screens happen not to read.
 */
function placeholderViewer(role: Role): Viewer {
  return {
    role,
    handle: 'you',
    societyName: 'Sunrise CHS',
    ...(role === 'resident' ? { flat: 'B-402' } : {}),
  }
}

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
    return <Hero phase={boot === 'failed' ? 'failed' : 'loading'} />
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

        `import.meta.env.DEV` is replaced by a literal at build time and
        the dead branch is tree-shaken, so the fixture — every flat's
        questions and dues — is absent from the production bundle
        instead of merely unused in it. countsFor with no sources
        returns an empty map, and an absent figure renders no badge
        rather than a zero: a zero claims nothing is waiting.
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
    </ViewerRoleContext.Provider>
  )
}

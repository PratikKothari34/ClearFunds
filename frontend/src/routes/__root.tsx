import { createRootRoute, Outlet } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'

/*
 * The root route holds the chrome every page shares - the fixed header, the
 * fixed sidebar, the content column - so no page re-implements it and they
 * cannot drift apart.
 *
 * TanStack file routing means THE FILENAME IS THE URL. Renaming a file in
 * this directory is a URL change, and the generated `routeTree.gen.ts` must
 * be rebuilt in the same commit or `tsc` will accept a link to a route that
 * no longer exists.
 */
export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

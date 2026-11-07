import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { AuthProvider } from './lib/session'
import { ToastProvider } from './components/ui'
import { Refused } from './lib/supabase'
import { Crashed } from './components/Crashed'
import './styles/app.css'

/*
 * staleTime is five minutes, not thirty seconds, and that is a NAVIGATION
 * decision rather than a tolerance for old figures.
 *
 * The dashboard loads nine of this app's twelve reads, and every other
 * resident-facing screen is a SUBSET of them - ledger, dues, my-flat,
 * disputes, approvals, sign-off and year-end need nothing the dashboard did
 * not already fetch. At thirty seconds, half a minute of reading the
 * dashboard made each of those navigations refetch on arrival; the cached
 * rows still render first, so nothing flashed, but the screen was behind a
 * request it did not need.
 *
 * Freshness does not depend on this number. Three things invalidate, and
 * between them they cover every way the record changes:
 *   - our own writes, which blanket-invalidate in useWrite's onSettled;
 *   - anyone else's, over the realtime channel in useLive;
 *   - refetchOnWindowFocus, for a tab left open.
 * An append-only ledger has no silent mutation for a poll to catch. Shortening
 * this back to 30s would not make the app more correct, only busier.
 *
 * gcTime is thirty minutes so a cached read survives a detour through a route
 * that does not use it - the default five would drop the ledger while someone
 * read a report, and the walk back through its pages is this app's most
 * expensive fetch.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: true,
      // A rule the server refused will refuse again.
      retry: (n, e) => !(e instanceof Refused) && n < 2,
    },
  },
})

/*
 * defaultErrorComponent is the error boundary this tree did not have.
 *
 * It is set on the ROUTER, not wrapped around RouterProvider, and that
 * placement is the whole point: a route's throw is caught inside the root
 * route's <Shell>, so the nav, the theme and the rest of the app survive and
 * one route's content is replaced. A boundary above RouterProvider would catch
 * the same throws and take the entire app down with them - which is what
 * already happens today, so it would be no improvement.
 *
 * Query failures do NOT come here. Query catches its own and the surfaces
 * render <Failed>. This exists for the throws Query cannot see, which are the
 * ones raised during render - money.ts raising RangeError on a value that is
 * not a safe integer being the documented case.
 */
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultErrorComponent: Crashed,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)

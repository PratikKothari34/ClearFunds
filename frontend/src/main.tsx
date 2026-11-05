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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
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

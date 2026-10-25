import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { routeTree } from './routeTree.gen'
import { initI18n, preferredLocale } from './lib/i18n'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The ledger is append-only: a row that has been read does not
      // change. Refetching it is wasted payload on a metered connection,
      // so cached entries stay fresh for a long window and the chain head
      // is what gets re-checked.
      staleTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  // Scroll restoration matters on the ledger: a resident who opens an
  // entry and comes back should land where they were, not at the top of
  // a thousand rows.
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root is missing from index.html')

/*
 * i18n is initialized before the first render, not alongside it.
 *
 * TODAY THIS COSTS NOTHING AND IS STILL THE RIGHT ORDER. The product
 * ships English only, the catalogue is bundled, and `initI18n('en')`
 * sets the document language and returns without touching the network
 * - so the await resolves from memory.
 *
 * The order is kept because it is the half that is hard to add back.
 * Rendering first would paint English, then swap once a catalogue
 * resolved, and the swap is a reflow of every line on the page - on
 * the ledger, the whole screen moving under a resident's thumb. The
 * hero's 400 ms floor covers that case: below the floor nothing has
 * been drawn yet, so there is nothing to reflow. A second locale
 * inherits both properties instead of needing them discovered again.
 */
const locale = preferredLocale()

initI18n(locale)
  .catch((error: unknown) => {
    // A failed init must not leave a blank page. i18next falls back to
    // the key, which is the English sentence, so the app is usable
    // untranslated — strictly better than nothing rendered at all.
    console.error('Translation setup failed; continuing in English.', error)
  })
  .finally(() => {
    createRoot(rootEl).render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </StrictMode>,
    )
  })

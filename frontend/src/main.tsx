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
 * Rendering first would paint English, then swap to Marathi once the
 * catalogue resolved. On a Devanagari locale the font arrives in that
 * same gap, so the swap is a reflow of every line on the page — on the
 * ledger that is the whole screen moving under a resident's thumb.
 *
 * The cost is one await before paint, and it resolves from memory for
 * English because the catalogue is bundled. The hero's 400 ms floor
 * covers the Devanagari case: below the floor nothing has been drawn
 * yet, so there is nothing to reflow.
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

// From vitest/config, not vite: Vite 8's own defineConfig does not accept
// the `test` block and rejects it at typecheck time.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// Route-level splitting is a standing budget, not a later optimization:
// the resident read path (hero, dashboard, ledger) must not pull in
// approvals, reports, dues, sign-off or committee management.
export default defineConfig(({ mode }) => ({
  /*
   * The fixture gate. `lib/devData.ts` imports `./devData.source`, which
   * resolves to the sample data in development and to an empty module in
   * a production build, so `lib/sample.ts` is not in the production
   * module graph at all.
   *
   * This is an ALIAS rather than an `import.meta.env.DEV` branch because
   * a branch cannot remove an import: the statement is hoisted before
   * the dead branch is dropped, so the module stays in the graph and its
   * strings stay in the chunk. `npm run fixtures` greps the built output
   * and fails if any fixture string survives, so this is verified rather
   * than assumed.
   */
  resolve: {
    alias: (mode === 'production'
      ? { './devData.source': './devData.empty' }
      : {}) as Record<string, string>,
  },
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  build: {
    // Measured floor with no application code: react and react-dom
    // dominate the bundle, and router-core, query-core and history are
    // the next largest. All of it is shared by every route, so
    // splitting cannot reduce first paint -- it can only make the
    // stable half cacheable on its own.
    //
    // No byte counts here on purpose. The vendor figures that matter
    // are gzip, not raw, and they are asserted in scripts/budget.mjs
    // against a per-group ceiling, which is the one place they can go
    // stale loudly instead of quietly.
    //
    // 180 kB is therefore set against the APP chunk, not the vendor one:
    // it is the number that moves when a feature is careless, and the one
    // worth failing a build over. Vendor is pinned separately below.
    chunkSizeWarningLimit: 180,
    rolldownOptions: {
      output: {
        // `codeSplitting`, not the deprecated `advancedChunks`, which
        // printed a warning on every build. Same `groups` shape.
        codeSplitting: {
          groups: [
            {
              // React and the renderer: changes only on a dependency
              // bump, so it keeps its own long-lived cache entry and an
              // app deploy does not re-download it.
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/,
            },
            {
              // Router, query and their stores. Also stable, but bumped
              // on a different cadence from React.
              name: 'tanstack',
              test: /node_modules[\\/]@tanstack[\\/]/,
            },
            {
              // Translation, grouped so the two halves land together and
              // under a name a bundle review can read. react-i18next
              // resolves through its `es/` directory, so without this the
              // chunk is called `es` and 28 kB looks like nothing.
              //
              // This group is NOT in the English load path: lib/i18n.ts
              // imports both packages dynamically, so an English-speaking
              // society never requests it. Keep it that way -- the
              // grouping only decides which chunk it lands in, not
              // whether it is fetched.
              name: 'i18n',
              test: /node_modules[\\/](i18next|react-i18next)[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
}))

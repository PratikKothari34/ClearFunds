// From vitest/config, not vite: Vite 8's own defineConfig does not accept
// the `test` block and rejects it at typecheck time.
import { randomBytes } from 'node:crypto'
import { defineConfig } from 'vitest/config'
import type { PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

/*
 * THE DEV-SERVER CSP NONCE.
 *
 * The shipped CSP is `script-src 'self' 'sha256-...'; style-src 'self'`:
 * no `'unsafe-inline'` anywhere. A production build earns that. It emits
 * a real .css file loaded by a <link>, and the one inline script is
 * allowed by its SHA-256.
 *
 * The dev server cannot satisfy it. It serves every stylesheet as a JS
 * module that injects a <style> tag at runtime, and it adds inline
 * scripts of its own for react-refresh. Under the production policy the
 * browser refuses all of them, so the app renders fully functional and
 * completely unstyled - no build error, nothing in the terminal, only
 * "Refused to apply inline style" in the browser console.
 *
 * `'unsafe-inline'` in dev would fix the symptom and is the wrong fix:
 * it makes dev and production run under DIFFERENT policies, so a real
 * CSP violation introduced in a component passes locally and fails for
 * a resident. A nonce keeps one policy shape in both modes - inline
 * content is allowed only when it carries a secret this process
 * generated, which is what a nonce is for.
 *
 * `html.cspNonce` is Vite's own support for this. It injects
 * <meta property="csp-nonce"> for the HMR client to read, and stamps
 * the nonce onto every script, style and stylesheet link in the HTML.
 *
 * Two consequences that are easy to get wrong:
 *
 * 1. It stamps the INLINE THEME SCRIPT too, changing its bytes and so
 *    its SHA-256. That is fine only because the CSP below also trusts
 *    the nonce, and a nonce match satisfies script-src on its own. The
 *    hash stays in the header, unchanged, for production.
 *
 * 2. The value must be fresh per server start. A nonce committed to a
 *    config file is a constant, and a constant nonce is `'unsafe-inline'`
 *    with extra steps.
 *
 * `apply: 'serve'` keeps the header rewrite out of `build`, so `preview`
 * and production serve the strict hash-only policy with no nonce in it.
 * `npm run csp-hash` reads dist/index.html, never this path, so the
 * value handed to the backend lane is unaffected.
 */
const DEV_CSP_NONCE = randomBytes(16).toString('base64')

function devCspNonce(): PluginOption {
  return {
    name: 'cf-dev-csp-nonce',
    apply: 'serve',
    transformIndexHtml: {
      // After Vite's own nonce stamping and tag injection, so the header
      // this writes describes the HTML that is actually served.
      order: 'post',
      handler(html) {
        const nonce = `'nonce-${DEV_CSP_NONCE}'`
        return html.replace(
          /content="(default-src[^"]*)"/,
          (_full, policy: string) =>
            `content="${policy
              .replace(/script-src ([^;]*)/, `script-src $1 ${nonce}`)
              .replace(/style-src ([^;]*)/, `style-src $1 ${nonce}`)}"`,
        )
      },
    },
  }
}

// Route-level splitting is a standing budget, not a later optimization:
// the resident read path (hero, dashboard, ledger) must not pull in
// approvals, reports, dues, sign-off or committee management.
export default defineConfig(({ mode }) => ({
  // Serve only. A production build must carry no nonce at all:
  // the inline script is allowed by hash, and a nonce in the built
  // HTML without one in the header would be dead weight.
  html: mode === 'production' ? {} : { cspNonce: DEV_CSP_NONCE },
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
    devCspNonce(),
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

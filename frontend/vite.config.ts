/*
 * From 'vitest/config', not 'vite': this config carries a `test` block, and
 * vite's own defineConfig does not type it. Importing from 'vite' let the
 * block through unchecked - a typo in a vitest option would have been
 * silently ignored rather than reported.
 */
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { randomBytes } from 'node:crypto'
import { loadEnv } from 'vite'

/*
 * THE DEV SERVER RUNS THE REAL PRODUCTION CSP, SATISFIED BY A NONCE.
 *
 * The production policy has no 'unsafe-inline'. The dev server injects every
 * stylesheet as an inline <style> tag, so under that policy the app renders
 * FULLY POPULATED AND COMPLETELY UNSTYLED - no build error, nothing in the
 * terminal, just a wall of unstyled text that looks like a broken Tailwind
 * install.
 *
 * The fix is a per-start random nonce, below. It is NEVER 'unsafe-inline':
 * adding that keyword would mean dev and production run different policies,
 * and the dev server would stop testing the real one. The whole point of
 * matching them is that a CSP violation shows up on this machine instead of
 * in front of a resident.
 *
 * Guarded by `src/lib/csp.test.ts`, which reads this file with comments
 * stripped - because the comment you are reading names the forbidden keyword.
 */
const DEV_NONCE = randomBytes(16).toString('base64')

function origins(): string[] {
  const env = loadEnv('development', process.cwd(), 'VITE_')
  return [env.VITE_SUPABASE_URL, env.VITE_ANCHOR_URL]
    .filter((u): u is string => !!u)
    .map((u) => new URL(u.replace('{society}', 'x')).origin)
}

const DEV_CSP = [
  "default-src 'self'",
  `script-src 'self' 'nonce-${DEV_NONCE}'`,
  `style-src 'self' 'nonce-${DEV_NONCE}'`,
  "img-src 'self' data:",
  "font-src 'self'",
  // The dev client needs its HMR websocket; production has no ws: at all.
  // The Supabase API and the published-head anchor are the only other
  // origins the app talks to.
  `connect-src 'self' ws: wss: ${origins().join(' ')}`,
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ')

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    {
      name: 'cf-dev-csp',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Content-Security-Policy', DEV_CSP)
          next()
        })
      },
    },
  ],
  html: { cspNonce: DEV_NONCE },
  build: {
    target: 'es2022',
    // Reported per chunk by `npm run budget`, which holds the real ceilings.
    chunkSizeWarningLimit: 200,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})

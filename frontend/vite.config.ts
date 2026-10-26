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
import { loadEnv, type PluginOption } from 'vite'

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

/*
 * THE DEV SERVER STOPS ITSELF WHEN NOTHING IS WATCHING IT.
 *
 * IDLE MEANS NO BROWSER IS ATTACHED - not "no request arrived recently".
 * Those differ, and the difference is the whole design: a tab left open on
 * the ledger sends no HTTP request for minutes at a time while someone
 * reads it. Shutting down under them because the network went quiet would
 * be a bug, not a feature.
 *
 * Vite holds an HMR websocket to every open tab, so `server.ws.clients.size`
 * is the honest signal. The countdown starts when the LAST client goes away
 * and is cancelled the moment one connects, so:
 *
 *   - a tab open and idle for an hour  -> stays up (someone is reading)
 *   - every tab closed                 -> stops after the grace period
 *   - started and never opened         -> stops after the grace period
 *
 * That last case is deliberate: a server nobody ever pointed a browser at
 * is the most common way one is left running for days.
 *
 * `apply: 'serve'` is what keeps this out of production. The plugin is not
 * merely inert during `vite build` - it is never constructed, so no deploy
 * (Vercel included) can carry a timer that kills a server.
 */
const IDLE_GRACE_MS = 2 * 60 * 1000

function devIdleShutdown(): PluginOption {
  return {
    name: 'cf-dev-idle-shutdown',
    apply: 'serve',
    configureServer(server) {
      /*
       * Opt out for a session that must outlive its browser - a long test
       * run, a tunnel, a machine left building. Any value but '0'/'false'
       * keeps the server up forever.
       */
      const raw = process.env.CF_DEV_IDLE_SHUTDOWN
      if (raw !== undefined && raw !== '1' && raw.toLowerCase() !== 'true') {
        return
      }

      let timer: NodeJS.Timeout | undefined

      const stop = () => {
        /*
         * Re-check at the moment of firing rather than trusting the timer.
         * A client can connect in the last millisecond before it fires, and
         * closing the server out from under a browser that just attached is
         * exactly the surprise this must not produce.
         */
        if (server.ws.clients.size > 0) {
          schedule()
          return
        }
        server.config.logger.info(
          `\n  no browser attached for ${IDLE_GRACE_MS / 1000}s - stopping the dev server.` +
            `\n  set CF_DEV_IDLE_SHUTDOWN=0 to keep it running.\n`,
        )
        /*
         * `close()` releases the port and the file watchers; exiting after
         * it is what frees the port for the next start. Without the exit the
         * process can linger holding nothing, which is the state that makes
         * `--strictPort` fail on an apparently-free port.
         */
        void server.close().then(
          () => process.exit(0),
          () => process.exit(1),
        )
      }

      const schedule = () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(stop, IDLE_GRACE_MS)
        /*
         * Do not hold the event loop open on this timer's account. Without
         * unref the process would stay alive for the grace period even after
         * everything else finished.
         */
        timer.unref?.()
      }

      const cancel = () => {
        if (timer) clearTimeout(timer)
        timer = undefined
      }

      /*
       * The disconnect has to be hooked on the SOCKET, not on server.ws.
       *
       * `server.ws.on('close')` reads like "a client closed" and is not:
       * it is the server's own websocket shutting down, so it fires once,
       * at exit. Listening there instead of here is a silent failure with
       * a nasty shape - the server stays up correctly while a tab is open,
       * then never starts the countdown after the last tab closes, so it
       * runs forever once anything has ever connected to it - the first
       * version of this plugin had exactly that bug, and it only showed up
       * by attaching a websocket, letting it go, and watching the clock.
       *
       * At socket-close time `clients.size` is already decremented, so the
       * count is read directly. No next-tick deferral is needed, and
       * adding one would only widen the window for a reconnect to be
       * missed.
       */
      server.ws.on('connection', (socket) => {
        cancel()
        socket.on('close', () => {
          if (server.ws.clients.size === 0) schedule()
        })
      })

      /* Started and not yet opened is idle too. */
      server.httpServer?.once('listening', () => {
        schedule()
      })
    },
  }
}

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
    devIdleShutdown(),
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

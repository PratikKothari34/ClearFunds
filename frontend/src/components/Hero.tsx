import { useEffect, useState } from 'react'
import {
  HERO_FLOOR_MS,
  HERO_SLOW_MS,
  type HeroPhase,
  strokePercent,
} from '../lib/hero'

/**
 * The first-load hero.
 *
 * This is a real waiting moment, not decoration. The resident read path
 * fetches the shell and the ledger head, and the dashboard's
 * fingerprint band separately fetches a published record from another
 * origin. That wait exists, so it is designed rather than papered over
 * with a spinner.
 *
 * THE 400 MS FLOOR AND THE 90% HOLD ARE THE WHOLE DESIGN:
 *
 *   - Under 400 ms the hero never renders at all. A hero that appears
 *     and vanishes is a flash, which is worse than no hero.
 *   - The stroke APPROACHES 90% and never arrives, let alone reaches
 *     100%. It is asymptotic: 82.6% at 4 s, 89.8% at 10 s, and still
 *     short of 90 at any elapsed time a person would sit through. A
 *     progress animation finishing while a request is still outstanding
 *     is the product lying on its first screen, and this product's
 *     entire claim is that it does not lie about state. The cap is
 *     enforced twice over - by the curve, and by a `Math.min` clamping
 *     a value the curve cannot produce.
 *   - 4 s is the SLOW THRESHOLD, which changes the COPY, not the
 *     stroke. The two numbers were conflated in this comment before.
 *   - The stroke is driven by ELAPSED TIME, not by fetch progress.
 *     There is no progress to read: the boot is a handful of requests
 *     with no byte counter. What IS tied to real state is when the hero
 *     stops - it unmounts when boot resolves, and `phase` recolours and
 *     freezes the stroke on failure. The motion is honest about waiting
 *     without claiming to measure anything.
 *
 * The dashboard is NOT held on the fingerprint fetch. The hero ends
 * when the shell and the ledger head are ready; the fingerprint band
 * carries its own pending state. Blocking the whole app on a
 * cross-origin request is the wrong trade on 4G.
 *
 * THE MARK IS HERE, AT 120px, AND IT IS THE SMALL SOURCE.
 *
 * This said "wordmark only, zero images" on the argument that an image
 * competes with the font payload on first load. That argument was
 * about the 240px mark the login screen uses. At 120px the file is
 * ~10 KB, and for every resident who reached this screen by signing
 * in it is already in the browser cache, because `/login` fetched the
 * same two sources moments earlier. The cost is a cache hit or 10 KB.
 *
 * `srcSet` deliberately does NOT offer the 240px file. A device with
 * DPR 2 would take it and double the weight for a mark rendered at
 * 120 CSS pixels, on the one screen where weight is paid before
 * anything is readable. Slight softness on a retina phone is the
 * better side of that trade; on the login screen, where the mark is
 * the subject rather than a waiting cue, 240px is still offered.
 *
 * CENTRED, AND THE BIND STILL RUNS. The mark is the thing to look at
 * while waiting, so it sits in the middle of the screen with the
 * wordmark and status under it. But the bound edge and the stroke
 * along it stay, because they are what the screens behind this one
 * are built from, and because the stroke is the only honest statement
 * of progress on the screen. A centred logo over a spinner is the
 * arrangement every loading screen defaults to; the bind is what
 * makes this one the product's own.
 *
 * The box is RESERVED with explicit width and height, so the wordmark
 * and status line do not jump when the image lands. A layout shift on
 * the first paint is exactly the kind of jitter this screen's 400 ms
 * floor exists to prevent.
 *
 * The mark is `aria-hidden`. The wordmark immediately below it is the
 * accessible name, and the whole screen is one `role="status"` region
 * — alt text here would have a screen reader announce "ClearFunds"
 * twice before the status it actually came for.
 *
 * The wordmark is set in the sans, like every other heading in the
 * product. It was Source Serif 4, which on a cream ground is the most
 * recognisable signature of a generated page.
 *
 * Under prefers-reduced-motion there is no stroke at all — a static
 * wordmark and a text status line, which carries the same information.
 */

export function Hero({
  phase = 'loading',
  reducedMotion,
}: {
  readonly phase?: HeroPhase
  /** Overridable for tests; otherwise read from the media query. */
  readonly reducedMotion?: boolean
}) {
  const elapsed = useElapsed()
  const prefersReduced = usePrefersReducedMotion(reducedMotion)

  // The floor. Nothing renders below it, so a fast connection never
  // sees a flash.
  if (elapsed < HERO_FLOOR_MS) return null

  const slow = phase === 'slow' || elapsed >= HERO_SLOW_MS
  const bootFailed = phase === 'boot-failed'
  const anchorUnreachable = phase === 'anchor-unreachable'
  // Either failure stops the stroke and recolours it; only the copy
  // below distinguishes them.
  const failed = bootFailed || anchorUnreachable
  const percent = strokePercent(elapsed)

  return (
    <div
      className="min-h-dvh flex flex-col justify-center gap-space-lg bg-surface"
      // The whole screen is one status region: a screen reader
      // announces the state change without the user hunting for it.
      role="status"
      aria-live="polite"
    >
      {/*
       * The bind runs the full height of the screen, as it does on
       * every screen behind this one. `cf-field` on the inner column
       * makes the wait happen ON the reading surface rather than on the
       * page ground, so the first paint already shows the product's
       * two surfaces.
       */}
      <div className="cf-bind cf-field py-space-xl px-gutter flex flex-col items-center gap-space-lg">
        {/*
         * `fetchPriority="high"` and no lazy attribute: this is the
         * only thing on the screen, so deferring it defeats the point
         * of putting it here. Not `decoding="async"` either — there is
         * nothing behind it whose paint we would be unblocking.
         */}
        <img
          src="/brand/mark-120.webp"
          width={120}
          height={120}
          alt=""
          aria-hidden="true"
          className="block"
          fetchPriority="high"
        />

        <p className="m-0 font-tabular-currency-lg text-tabular-currency-lg font-medium text-on-surface leading-none">
          ClearFunds
        </p>

        {/*
         * The stroke runs along the bind's own line, left-aligned and
         * full width rather than a centred 20rem bar, so it reads as the
         * register's rule being drawn. No stroke at all under reduced
         * motion — the status line below carries the same fact.
         */}
        {!prefersReduced && (
          <div
            className="w-full h-px bg-outline overflow-hidden"
            aria-hidden="true"
          >
            <div
              className={`h-px ${failed ? 'bg-error' : 'bg-primary-container'}`}
              style={{
                // The stroke STOPS where it was when the fetch failed; it
                // does not retreat and does not continue. Its colour is
                // what changes.
                width: `${percent}%`,
                // Width is driven by elapsed time, and the transition
                // only smooths between frames. It is not the animation:
                // a CSS animation would run on its own and could finish
                // while a fetch is pending.
                transition: 'width 200ms linear',
              }}
            />
          </div>
        )}

        <p className="m-0 font-label-code-sm text-label-code-sm text-on-surface-variant max-w-[40ch] text-center">
          {/*
           * The boot failure is checked FIRST and says what is true: the
           * ledger is not there. It must never contain the word "loaded"
           * and must never blame the published record, which on this path
           * was not fetched at all. The resident is on a screen with no
           * balance and no history, so the line has to tell them that and
           * give them something to do.
           */}
          {bootFailed
            ? 'The ledger could not be loaded. Check your connection and try again.'
            : anchorUnreachable
              ? 'Loaded, but the published record could not be reached. The history is shown with that check pending.'
              : slow
                ? 'Still loading. The connection looks slow.'
                : 'Loading the society ledger'}
        </p>
      </div>
    </div>
  )
}

/**
 * Milliseconds since mount, sampled coarsely.
 *
 * A 100 ms tick, not requestAnimationFrame: the stroke's job is to show
 * that something is happening, and a 60 fps timer on a mid-range
 * Android spends battery to move a hairline by a pixel.
 */
function useElapsed(): number {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    /*
     * The clock starts here, not in a useRef initializer.
     *
     * `useRef(Date.now())` evaluates the call on every render — React
     * throws the argument away after mount, but the read still
     * happens, which makes it impure during render. It is also wrong
     * under StrictMode, where the double-invoked first render means
     * the retained value is the second call's, so the stroke measures
     * from slightly after the real mount.
     *
     * In an effect it runs exactly once per mount, and the elapsed
     * figure is honest about when the wait actually began — which is
     * the one thing this component exists to be.
     */
    const start = Date.now()
    const id = window.setInterval(() => {
      setElapsed(Date.now() - start)
    }, 100)
    return () => window.clearInterval(id)
  }, [])

  return elapsed
}

function usePrefersReducedMotion(override?: boolean): boolean {
  const [reduced, setReduced] = useState(() => {
    if (override !== undefined) return override
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (override !== undefined) return
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [override])

  return override ?? reduced
}

import { useEffect, useState } from 'react'

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
 * cross-origin request is the wrong trade on patchy 4G.
 *
 * Wordmark only, zero images: the brand mark is on the login screen at
 * 240px. An image here competes with the font payload on first load.
 *
 * Under prefers-reduced-motion there is no stroke at all — a static
 * wordmark and a text status line, which carries the same information.
 */

/** Below this, the hero is a flash. It does not render. */
export const HERO_FLOOR_MS = 400

/** Past this, the stroke holds at the cap and the copy changes. */
export const HERO_SLOW_MS = 4000

/**
 * The stroke never passes this while anything is outstanding. Reaching
 * 100% is reserved for actual completion.
 */
export const HERO_HOLD_PERCENT = 90

/**
 * The hero's phases. TWO DIFFERENT FAILURES, NAMED DIFFERENTLY.
 *
 * `anchor-unreachable` was called `failed`, and that name is what
 * caused the bug this union now prevents: `useBoot` also reports
 * `'failed'`, for the unrelated case of the boot fetch itself failing,
 * and the root route wired one into the other. The hero then told a
 * resident staring at a blank screen that the ledger had *loaded* and
 * only the published-record check was pending — three false statements
 * at once, announced through aria-live, with no error and no retry.
 *
 * A generic `failed` on a screen that can fail in two ways is an
 * invitation to map the wrong one onto it, so neither value is called
 * that. The copy for each says which thing failed.
 */
export type HeroPhase =
  | 'loading'
  | 'slow'
  /** The boot fetch failed: there is no ledger on screen. */
  | 'boot-failed'
  /** The ledger is in hand; only the published-record check did not resolve. */
  | 'anchor-unreachable'

/**
 * How far the stroke has travelled, given how long we have waited.
 *
 * Pure and exported so the holding behaviour is testable without a
 * timer: the test that matters is that no elapsed time produces 100.
 */
export function strokePercent(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  // Approaches the hold asymptotically rather than linearly, so the
  // motion slows as it goes and never appears stalled early.
  const progress = 1 - Math.exp(-elapsedMs / 1600)
  return Math.min(HERO_HOLD_PERCENT, progress * HERO_HOLD_PERCENT)
}

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
      className="min-h-dvh flex flex-col items-center justify-center gap-(--cf-s3) px-(--cf-s3) bg-surface"
      // The whole screen is one status region: a screen reader
      // announces the state change without the user hunting for it.
      role="status"
      aria-live="polite"
    >
      <p className="m-0 font-serif text-figure font-normal text-ink">
        ClearFunds
      </p>

      {/*
       * One hairline, matching the ledger's rules, so the first screen
       * looks like the product it opens. No stroke at all under
       * reduced motion — the status line below carries the same fact.
       */}
      {!prefersReduced && (
        <div
          className="w-full max-w-[20rem] h-px bg-rule overflow-hidden"
          aria-hidden="true"
        >
          <div
            className={`h-px ${failed ? 'bg-debit' : 'bg-anchor'}`}
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

      <p className="m-0 text-meta text-ink-quiet text-center max-w-[40ch]">
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

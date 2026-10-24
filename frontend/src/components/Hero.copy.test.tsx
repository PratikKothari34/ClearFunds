import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hero, HERO_FLOOR_MS, type HeroPhase } from './Hero'

/*
 * The hero's COPY, asserted per phase.
 *
 * Hero.test.ts covers the stroke arithmetic and the thresholds. This
 * file covers the thing that arithmetic cannot catch: whether the
 * sentence on screen is true.
 *
 * The bug it exists for: the hero's failure phase was called `failed`,
 * `useBoot` also reports `failed` for the unrelated case of the boot
 * fetch failing, and the root route wired one into the other. Because
 * that branch returns the hero INSTEAD of the shell, a resident with no
 * ledger on screen was told - through aria-live - that it had loaded,
 * that the published record was the problem, and that the history was
 * in front of them. All three false.
 *
 * These assert the RULE for each phase rather than matching the whole
 * sentence, so rewording the copy does not fail them but reintroducing
 * the false claim does.
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * The hero's copy at a phase, rendered past its floor.
 *
 * FAKE TIMERS, NOT A `Date.now` STUB. The elapsed clock starts inside a
 * useEffect and advances on a 100ms setInterval, so stubbing `Date.now`
 * and re-rendering moves nothing: the hero stays under its floor and
 * returns null. The first version of this helper did exactly that, and
 * three of these tests passed against an empty string, because
 * `not.toContain` is trivially true on ''. A copy test that renders
 * nothing is worse than no copy test — it reports the claim is absent
 * when the claim was never on screen to begin with.
 *
 * Hence the assertion below rather than a comment: the helper proves it
 * rendered something before any caller is allowed to assert what that
 * something does not say.
 */
function copyAt(phase: HeroPhase): string {
  const r = render(<Hero phase={phase} reducedMotion />)
  // Inside act, so the interval's setElapsed is flushed before reading.
  act(() => {
    vi.advanceTimersByTime(HERO_FLOOR_MS + 150)
  })

  /*
   * The STATUS LINE, not the whole container.
   *
   * `container.textContent` runs the wordmark straight into the message
   * with no separator, giving "ClearFundsLoaded, but..." — which breaks
   * word-boundary and start-anchored matching alike, because there is no
   * non-word character in front of "Loaded". Two versions of the
   * affirmative-claim assertion were silently inert for exactly that
   * reason before this helper stopped returning the concatenation.
   *
   * The last <p> is the status line; the first is the wordmark.
   */
  const paragraphs = r.container.querySelectorAll('p')
  expect(paragraphs.length).toBeGreaterThan(1)
  const text = paragraphs[paragraphs.length - 1]?.textContent ?? ''
  expect(text).not.toBe('')
  return text
}

describe('boot-failed copy', () => {
  it('does not claim anything loaded', () => {
    /*
     * The decisive constraint. On this path the hero REPLACES the
     * shell, so there is no balance and no history behind it. Telling a
     * resident the ledger loaded is the opposite of what is on screen.
     *
     * The AFFIRMATIVE claim is what is banned, not the word. A bare
     * `not.toContain('loaded')` also rejects "could not be loaded",
     * which is the honest line — and this assertion failed on exactly
     * that, correctly. What must never appear is a sentence asserting
     * the ledger IS loaded: `anchor-unreachable` opens with "Loaded,",
     * so that word on this phase is the regression.
     *
     * CASE-SENSITIVE ON PURPOSE: capital-L `Loaded` is what separates
     * the affirmative claim from the honest "could not be loaded", so
     * do not add the `i` flag. It works only because `copyAt` returns
     * the status paragraph alone — against the whole container the
     * wordmark supplies no word boundary and this matches nothing.
     */
    const text = copyAt('boot-failed')
    expect(text).not.toMatch(/\bLoaded\b/)
    expect(text.toLowerCase()).not.toContain('is loaded')
  })

  it('does not blame the published record', () => {
    /*
     * The published-record fetch is never attempted on a boot failure.
     * Blaming it points a volunteer treasurer at the wrong problem and
     * misrepresents the product's central security claim as broken when
     * it was not even checked.
     */
    expect(copyAt('boot-failed')).not.toContain('published record')
  })

  it('does not promise the history is shown', () => {
    expect(copyAt('boot-failed')).not.toContain('history is shown')
  })

  it('says the ledger could not be loaded and gives an action', () => {
    // An empty state has to give direction, not just report a fault.
    const text = copyAt('boot-failed')
    expect(text).toContain('could not be loaded')
    expect(text.toLowerCase()).toContain('try again')
  })
})

describe('anchor-unreachable copy', () => {
  it('still says the history is shown, because on this path it is', () => {
    /*
     * The mirror of the above. Here the ledger IS in hand and only the
     * cross-origin check did not resolve, so the reassurance is true
     * and must not be lost while fixing the other phase.
     */
    const text = copyAt('anchor-unreachable')
    expect(text).toContain('published record')
    expect(text).toContain('history is shown')
  })
})

describe('the two failures never share copy', () => {
  it('reads differently in each phase', () => {
    /*
     * The assertion that would have caught the original bug. Two
     * distinct failures rendering the same sentence means one of them
     * is lying, whichever sentence it is.
     */
    const boot = copyAt('boot-failed')
    const anchor = copyAt('anchor-unreachable')
    expect(boot).not.toBe(anchor)
  })
})

describe('loading copy', () => {
  it('does not assert a failure while still loading', () => {
    const text = copyAt('loading')
    expect(text).toContain('Loading the society ledger')
    expect(text).not.toContain('could not')
  })

  it('says the connection looks slow rather than that something broke', () => {
    const text = copyAt('slow')
    expect(text.toLowerCase()).toContain('slow')
    expect(text).not.toContain('could not')
  })
})

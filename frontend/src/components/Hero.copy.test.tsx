import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hero } from './Hero'
import { HERO_FLOOR_MS, type HeroPhase } from '../lib/hero'

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

describe('the brand mark', () => {
  /**
   * The mark, rendered past the floor. Separate from `copyAt`, which
   * returns a string and cannot answer questions about an element.
   */
  function markAt(phase: HeroPhase = 'loading'): HTMLImageElement | null {
    const r = render(<Hero phase={phase} reducedMotion />)
    act(() => {
      vi.advanceTimersByTime(HERO_FLOOR_MS + 150)
    })
    return r.container.querySelector('img')
  }

  it('is not announced, because the wordmark beside it already is', () => {
    /*
     * The whole screen is one aria-live region, so anything with an
     * accessible name here is read out before the status the resident
     * is actually waiting for. A mark with alt="ClearFunds" above a
     * wordmark reading "ClearFunds" announces the brand twice and the
     * state last.
     *
     * Asserts BOTH halves. `aria-hidden` alone with a non-empty alt
     * is a contradiction some tools resolve the wrong way, and an
     * empty alt alone leaves the image in the tree as an unnamed
     * graphic. Neither on its own is the decorative shape.
     */
    const img = markAt()
    expect(img).not.toBeNull()
    expect(img?.getAttribute('alt')).toBe('')
    expect(img?.getAttribute('aria-hidden')).toBe('true')
  })

  it('reserves its box, so nothing below it moves when it lands', () => {
    /*
     * Width and height as ATTRIBUTES, not only as CSS. The attributes
     * are what give the browser an aspect ratio before the bytes
     * arrive; a class alone leaves the box at zero height until the
     * image decodes, and the wordmark and status line jump down when
     * it does. This screen's 400ms floor exists to avoid exactly that
     * kind of jitter, so reintroducing it here would be self-defeating.
     *
     * The assertion is that both are present and agree with each
     * other - a square - rather than that either is 120. A later
     * decision to render it larger is not a regression; rendering it
     * without a reserved box is.
     */
    const img = markAt()
    const w = img?.getAttribute('width')
    const h = img?.getAttribute('height')
    expect(w).toBeTruthy()
    expect(h).toBeTruthy()
    expect(w).toBe(h)
  })

  it('does not offer the large source on the one screen that pays for it', () => {
    /*
     * The boot screen is the single place in the product where bytes
     * are spent before anything is readable. A `srcSet` naming the
     * 240px file lets any DPR-2 phone - most of this market - take it
     * and double the weight for a mark drawn at 120 CSS pixels.
     *
     * Asserts the ABSENCE of the larger source rather than the exact
     * `src` string, so renaming or re-encoding the file does not fail
     * this, while re-adding the retina source does. The login screen
     * is free to offer 240px and does; there the mark is the subject,
     * and nothing is waiting on it.
     */
    const img = markAt()
    const sources = `${img?.getAttribute('src') ?? ''} ${img?.getAttribute('srcset') ?? ''}`
    expect(sources).not.toContain('240')
  })

  it('still shows on a failed boot, where the wait is longest', () => {
    /*
     * The failure phases recolour the stroke and rewrite the copy.
     * Neither unmounts the mark: a resident staring at an error has
     * been looking at this screen longer than anyone, and dropping
     * the only non-text element at that moment makes a failure look
     * like a broken page rather than a reported one.
     */
    expect(markAt('boot-failed')).not.toBeNull()
    expect(markAt('anchor-unreachable')).not.toBeNull()
  })
})

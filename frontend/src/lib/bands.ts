import { useCallback, useState } from 'react'

/**
 * Per-band failure state for the dashboard.
 *
 * WHY THIS IS A MODULE AND NOT TWO useState CALLS IN THE ROUTE: the
 * design's rule is that the five dashboard bands fetch independently,
 * so one can fail while the rest of the page succeeds. The cheap
 * implementation — a single `failed` boolean threaded into every band —
 * satisfies the types, reads correctly, and produces the one behaviour
 * the design rules out: all five bands failing together. Keyed state
 * makes that mistake unavailable rather than merely discouraged.
 *
 * Each band's retry clears ONLY its own key. A retry that reset every
 * band would re-request four things that are already on screen, on the
 * connection of someone who just demonstrated they have a bad one.
 *
 * This is deliberately not a store and not a query client. When the
 * endpoints exist each band gets its own TanStack Query, `failed`
 * becomes that query's `isError`, and `retry` becomes its `refetch` —
 * this module is then deleted. It exists so the failure branches are
 * reachable before then; a branch nothing can reach is a branch that
 * is already wrong.
 */

/** The five bands, in render order. */
export const BAND_NAMES = [
  'balance',
  'attention',
  'fingerprint',
  'period',
  'recent',
] as const

export type BandName = (typeof BAND_NAMES)[number]

export interface BandStates {
  readonly failed: (name: BandName) => boolean
  /** Clears this band's failure only. Never the others'. */
  readonly retry: (name: BandName) => void
  /** Marks one band failed. Used by the dashboard route and by tests. */
  readonly fail: (name: BandName) => void
}

export function useBandStates(
  initial: readonly BandName[] = [],
): BandStates {
  // A Set of failed names, not a record of five booleans: the absent
  // case and the false case are then the same thing, so a band added
  // later cannot default to "failed" by being left out of an object.
  const [failedSet, setFailedSet] = useState<ReadonlySet<BandName>>(
    () => new Set(initial),
  )

  const failed = useCallback(
    (name: BandName) => failedSet.has(name),
    [failedSet],
  )

  const retry = useCallback((name: BandName) => {
    setFailedSet((prev) => {
      if (!prev.has(name)) return prev
      const next = new Set(prev)
      next.delete(name)
      return next
    })
  }, [])

  const fail = useCallback((name: BandName) => {
    setFailedSet((prev) => {
      if (prev.has(name)) return prev
      return new Set(prev).add(name)
    })
  }, [])

  return { failed, retry, fail }
}

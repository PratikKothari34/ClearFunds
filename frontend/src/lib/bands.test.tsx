import { describe, expect, it } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BAND_NAMES, useBandStates, type BandStates } from './bands'

/**
 * These assert the ONE property a shared `failed` boolean would also
 * have satisfied every other way: that a band's failure, and its
 * retry, touch nothing else. That is the design rule — the bands fetch
 * independently — and it is the rule the cheap implementation breaks
 * while still typechecking and still rendering a retry.
 */

/**
 * Mounts the hook and hands back a live handle to it.
 *
 * The captured value is written in an effect rather than during
 * render: an assignment to an outer variable mid-render is a side
 * effect, and act() flushes effects before returning, so by the time a
 * test reads `current` the commit has happened.
 */
function mountHook(initial: readonly (typeof BAND_NAMES)[number][] = []) {
  const holder: { states?: BandStates } = {}
  function Probe() {
    const states = useBandStates(initial)
    useEffect(() => {
      holder.states = states
    })
    return null
  }
  const host = document.createElement('div')
  const root = createRoot(host)
  act(() => {
    root.render(<Probe />)
  })
  return {
    get current(): BandStates {
      if (!holder.states) throw new Error('hook never ran')
      return holder.states
    },
    unmount: () => act(() => root.unmount()),
  }
}

describe('useBandStates', () => {
  it('starts with no band failed', () => {
    const h = mountHook()
    for (const name of BAND_NAMES) {
      expect(h.current.failed(name), name).toBe(false)
    }
    h.unmount()
  })

  it('fails exactly one band', () => {
    const h = mountHook()
    act(() => h.current.fail('fingerprint'))
    expect(h.current.failed('fingerprint')).toBe(true)
    // The point of the test. A shared boolean passes the line above
    // and fails every line below.
    for (const name of BAND_NAMES.filter((n) => n !== 'fingerprint')) {
      expect(h.current.failed(name), name).toBe(false)
    }
    h.unmount()
  })

  it('retries one band without clearing the others', () => {
    const h = mountHook()
    act(() => {
      h.current.fail('balance')
      h.current.fail('recent')
    })
    expect(h.current.failed('balance')).toBe(true)
    expect(h.current.failed('recent')).toBe(true)

    act(() => h.current.retry('balance'))
    expect(h.current.failed('balance')).toBe(false)
    expect(
      h.current.failed('recent'),
      'retrying one band must not re-request the others',
    ).toBe(true)
    h.unmount()
  })

  it('treats a repeated fail and a redundant retry as no-ops', () => {
    const h = mountHook()
    act(() => h.current.fail('period'))
    act(() => h.current.fail('period'))
    expect(h.current.failed('period')).toBe(true)
    act(() => h.current.retry('period'))
    act(() => h.current.retry('period'))
    expect(h.current.failed('period')).toBe(false)
    h.unmount()
  })

  it('honours an initial failed set', () => {
    const h = mountHook(['attention'])
    expect(h.current.failed('attention')).toBe(true)
    expect(h.current.failed('balance')).toBe(false)
    h.unmount()
  })

  it('lists every band exactly once, in render order', () => {
    // The route spreads props per name; a duplicate or a missing name
    // there is silent, so the list is pinned here.
    expect(new Set(BAND_NAMES).size).toBe(BAND_NAMES.length)
    expect([...BAND_NAMES]).toEqual([
      'balance',
      'attention',
      'fingerprint',
      'period',
      'recent',
    ])
  })
})

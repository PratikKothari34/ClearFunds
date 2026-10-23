import { useEffect, useState } from 'react'

/**
 * Whether the app is ready to show the shell.
 *
 * READY MEANS THE SHELL AND THE LEDGER HEAD, NOTHING MORE. The
 * published-fingerprint check is a cross-origin fetch and the slowest
 * thing on the first screen; holding the whole app on it would mean a
 * resident on patchy 4G stares at the hero while their balance is
 * already in hand. The fingerprint band owns its own pending state and
 * resolves independently.
 *
 * `failed` here means the boot fetch itself failed, which is a
 * different thing from the fingerprint being unreachable. The hero's
 * `failed` phase is for the latter; this hook reports the former.
 *
 * Stubbed until the session and ledger endpoints exist. The delay is
 * deliberately above the 400 ms hero floor so the hero is on screen
 * during development instead of being discovered in production.
 */

const STUB_BOOT_MS = 900

export type BootState = 'loading' | 'ready' | 'failed'

export function useBoot(): BootState {
  const [state, setState] = useState<BootState>('loading')

  useEffect(() => {
    let live = true
    const id = window.setTimeout(() => {
      if (live) setState('ready')
    }, STUB_BOOT_MS)

    return () => {
      // Guards against a state write after unmount, which React logs
      // and which would otherwise appear once the real fetch lands
      // here and a route change cancels it.
      live = false
      window.clearTimeout(id)
    }
  }, [])

  return state
}

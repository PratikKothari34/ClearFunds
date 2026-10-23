import { useCallback, useEffect, useState } from 'react'
import {
  applyChoice,
  readChoice,
  resolve,
  toggle,
  watchSystem,
  type ResolvedTheme,
  type ThemeChoice,
} from './theme'

/**
 * Current theme plus the two-state toggle.
 *
 * The attribute is already set before first paint by the inline script in
 * index.html; this hook adopts that state rather than re-deciding it, so
 * nothing flashes on hydration.
 */
export function useTheme(): {
  choice: ThemeChoice
  resolved: ResolvedTheme
  flip: () => void
} {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice)
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    resolve(readChoice()),
  )

  // While the choice is `system`, follow the OS live: a resident whose
  // phone switches to dark at sunset should not have to reload.
  useEffect(() => {
    if (choice !== 'system') return
    return watchSystem(() => setResolved(resolve('system')))
  }, [choice])

  const flip = useCallback(() => {
    const next = toggle(choice)
    applyChoice(next)
    setChoice(next)
    setResolved(next)
  }, [choice])

  return { choice, resolved, flip }
}

/**
 * Theme state.
 *
 * The stored choice has three values but **the control has two**. The
 * design is explicit about this: a rotating "System / Light / Dark"
 * control makes a volunteer press a button three times to find out what
 * it does. So `system` is the untouched starting state, never a position
 * the toggle cycles into — `toggle()` only ever returns 'light' or
 * 'dark'.
 *
 * The theme is never sent to the server and never stored in the ledger.
 * It is a per-device display preference, so localStorage is correct here
 * and a server round-trip would be wrong — a resident reading on a phone
 * at night and a desktop by day wants different answers.
 */

export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'cf-theme'

/** What is actually painted, after resolving `system`. */
export type ResolvedTheme = 'light' | 'dark'

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

/**
 * Reads the stored choice. Every access is guarded: in a private window,
 * with site data blocked, or in a thumbnail capture, localStorage can
 * throw rather than return null.
 */
export function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* Unavailable storage is not an error: `system` is the default. */
  }
  return 'system'
}

export function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') return prefersDark() ? 'dark' : 'light'
  return choice
}

/**
 * Applies a choice to the document and persists it.
 *
 * `system` removes the attribute rather than writing a value, so the
 * stylesheet's media query takes over and a later change to the OS
 * setting is followed live without a reload.
 */
export function applyChoice(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', choice)
  }
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    /* The theme still applies for this session; it just will not persist. */
  }
}

/**
 * What the two-state control does when pressed.
 *
 * From `system` it resolves what is on screen and flips that, so the
 * first press always visibly changes the theme. It never returns
 * `system`: once a resident has expressed a preference, silently handing
 * control back to the OS would undo their choice without being asked.
 */
export function toggle(current: ThemeChoice): Exclude<ThemeChoice, 'system'> {
  return resolve(current) === 'dark' ? 'light' : 'dark'
}

/** Notifies when the OS preference changes, for `system` only. */
export function watchSystem(fn: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', fn)
  return () => mq.removeEventListener('change', fn)
}

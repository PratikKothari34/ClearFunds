import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { Role } from '../lib/types'
import { navFor, splitForMobile } from '../lib/nav'
import { NavBadge } from './NavBadge'
import { addableCount } from '../lib/countable'

/**
 * The bottom tab bar, under 768px only.
 *
 * At most five slots. When a role has more items than that, the fifth
 * is `More` and the overflow opens upward as a sheet — not a drawer
 * from the side and not a hamburger, both of which hide the whole
 * navigation rather than the part that did not fit.
 *
 * Anything carrying a live count is promoted into the bar by
 * splitForMobile, because a badge inside a collapsed menu is a
 * notification nobody sees.
 */

export function MobileTabBar({
  role,
  counts,
}: {
  readonly role: Role
  readonly counts: Readonly<Record<string, number>>
}) {
  const [open, setOpen] = useState(false)
  const { tabs, more } = splitForMobile(navFor(role), counts)

  /*
   * A STABLE IDENTITY, because the sheet's focus effect depends on it.
   *
   * This was an inline `() => setOpen(false)`, a new function on every
   * render. `MoreSheet`'s effect lists `onClose` in its dependencies -
   * correctly, since it registers a key handler that calls it - so the
   * effect tore down and re-ran on each render of this component, and
   * its first act is to move focus to the sheet's first link. A
   * resident who had tabbed to the third item was pulled back to the
   * first by any unrelated re-render, which on a keyboard is being
   * silently interrupted.
   *
   * Fixed here rather than by dropping the dependency: an effect that
   * closes over a stale `onClose` is the same bug waiting for the
   * handler to change.
   */
  const close = useCallback(() => setOpen(false), [])

  return (
    <>
      {open && more.length > 0 && (
        <MoreSheet items={more} counts={counts} onClose={close} />
      )}

      {/*
       * pb-[env(safe-area-inset-bottom)] keeps the row above the home
       * indicator on a notched phone, where otherwise the last 20px of
       * every tap target is unreachable.
       */}
      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 left-0 right-0 z-20 flex border-t border-outline-variant bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        {tabs.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            // 44px is the floor for a tap target. The design case is a
            // volunteer standing in a stairwell, not a careful tap.
            className="flex-1 min-h-11 flex flex-col items-center justify-center gap-0.5 py-space-sm font-label-code-sm text-label-code-sm text-on-surface-variant aria-[current=page]:text-on-surface aria-[current=page]:font-medium"
            activeOptions={{ exact: item.to === '/' }}
          >
            <span className="flex items-center gap-1">
              {item.label}
              <NavBadge count={counts[item.to]} label={item.label} />
            </span>
          </Link>
        ))}

        {more.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="cf-more-sheet"
            className="flex-1 min-h-11 flex flex-col items-center justify-center gap-0.5 py-space-sm font-label-code-sm text-label-code-sm text-on-surface-variant"
          >
            <span className="flex items-center gap-1">
              More
              {/*
               * The overflow carries the sum of what it hides, so a
               * promoted-out item is not the only way to learn
               * something is pending. Without it, a count on a hidden
               * item is invisible until the sheet is opened.
               */}
              <NavBadge
                count={more.reduce((n, i) => n + addableCount(counts[i.to]), 0)}
                label="More"
              />
            </span>
          </button>
        )}
      </nav>
    </>
  )
}

function MoreSheet({
  items,
  counts,
  onClose,
}: {
  readonly items: readonly { to: string; label: string }[]
  readonly counts: Readonly<Record<string, number>>
  readonly onClose: () => void
}) {
  const sheetRef = useRef<HTMLDivElement>(null)

  /*
   * A sheet that covers the page has to be dismissible and containable
   * from the keyboard, or it is a trap in the bad sense: a resident
   * tabbing past the last link lands on the navigation behind the
   * scrim, which they can focus but cannot see.
   *
   * This is deliberately not a <dialog>. The sheet sits above a fixed
   * tab bar and must not be modal to the scrim's own tap-to-close, and
   * showModal() puts it in the top layer where the safe-area padding
   * that keeps it clear of the home indicator no longer applies.
   */
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null

    // Focus the first link rather than the container: the container is
    // not interactive, so a screen reader would announce the sheet and
    // then have nothing to act on.
    const first = sheetRef.current?.querySelector<HTMLElement>('a[href]')
    first?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      )
      if (!focusable || focusable.length === 0) return

      const firstEl = focusable[0]
      const lastEl = focusable[focusable.length - 1]
      if (!firstEl || !lastEl) return

      // Wrap at both ends, so focus cycles inside the sheet instead of
      // escaping to the page the scrim is covering.
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault()
        lastEl.focus()
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Focus goes back to the More button, not to the top of the page.
      // Returning it to the body would make the next Tab start the whole
      // navigation again.
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <>
      {/*
       * The scrim closes the sheet on a tap outside. It is a plain div,
       * not a button: a full-screen button is announced as a control
       * and lands in the tab order ahead of the sheet's own links.
       */}
      <div
        className="md:hidden fixed inset-0 z-20 bg-on-surface/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        id="cf-more-sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="More"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-outline-variant bg-surface pb-[calc(env(safe-area-inset-bottom)+3.5rem)]"
      >
        <ul className="py-space-sm">
          {items.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={onClose}
                className="flex items-center justify-between min-h-11 px-gutter py-space-md aria-[current=page]:font-medium"
              >
                <span>{item.label}</span>
                <NavBadge count={counts[item.to]} label={item.label} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

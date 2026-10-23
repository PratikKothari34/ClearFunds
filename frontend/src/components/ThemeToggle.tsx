import { useTheme } from '../lib/useTheme'

/**
 * The two-state light/dark control. In the header on every screen, never
 * in a settings page: a resident reading a ledger outdoors at noon needs
 * it where they are.
 *
 * No transition animation. Cross-fading a ledger of amounts is motion
 * attached to no change in the record.
 */
export function ThemeToggle() {
  const { resolved, flip } = useTheme()
  const goingTo = resolved === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={flip}
      // The label says what pressing it does, not what the state is: a
      // switch labelled with its current state is ambiguous about which
      // way it will go.
      aria-label={`Switch to ${goingTo} mode`}
      title={`Switch to ${goingTo} mode`}
      className="inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-quiet hover:text-ink"
    >
      {/*
        Icons are inline SVG with currentColor, not an icon font and not a
        sprite request: two glyphs do not justify a network round trip on
        a patchy connection.

        aria-hidden because the button already carries the label; a
        screen reader announcing the path as well would read it twice.
      */}
      {resolved === 'dark' ? (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4.25" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />
        </svg>
      )}
    </button>
  )
}

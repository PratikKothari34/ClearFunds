export interface NavBadgeProps {
  count: number
  /* What the count is about, so the accessible text is a sentence. */
  label: string
}

/*
 * The count of entries waiting on this admin, in the export's own badge
 * position and shape.
 *
 * THE FILL IS `error`, AND THAT IS NOT A SEVERITY CLAIM. The token is named
 * for its place in a Material palette, not for what it means here - and it
 * is the pairing the export's own sidebar badge uses.
 *
 * It took three attempts to get right, which is worth recording:
 *
 *   - A mechanical token sweep mapped the original `bg-attention` to
 *     `bg-tertiary-fixed`, a pale peach (#ffdcc3). That put a near-white
 *     label at 1.23:1 - a badge with an invisible number in it.
 *   - The saturated `tertiary` is #000000 in this palette, so it is no help
 *     as a fill for white text that needs to read as a count, not a dot.
 *   - `error` is #ba1a1a against `on-error` white: 6.15:1.
 *
 * The badge's glyph is `aria-hidden` and the words sit beside it, so a
 * screen reader hears "3 entries awaiting approval" rather than a bare
 * numeral - and the count never depends on the colour being perceived.
 */
export function NavBadge({ count, label }: NavBadgeProps) {
  if (count <= 0) return null

  return (
    <span className="ml-auto flex shrink-0 items-center">
      <span
        aria-hidden="true"
        className="cf-tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-label-code-sm font-label-code-sm leading-none text-on-error"
      >
        {count}
      </span>
      <span className="cf-sr-only">
        {count === 1
          ? `, 1 entry awaiting approval in ${label}`
          : `, ${count} entries awaiting approval in ${label}`}
      </span>
    </span>
  )
}

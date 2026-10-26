/*
 * The ClearFunds mark.
 *
 * This is a raster image, not an inline SVG, and that has one consequence
 * worth knowing before changing a caller: ITS COLOURS CANNOT BE OVERRIDDEN
 * FROM A CLASS. The previous mark was three <rect>s, and Login.tsx inverted
 * it on the dark panel with a Tailwind selector on those rects. A class like
 * that now does nothing at all - silently, with no build error - so the
 * artwork carries its own white rounded plate instead, which is what makes
 * it legible on the dark panel and on a white header alike.
 *
 * Served at 128px, which is more than 2x the largest use (size-14 = 56px),
 * so it stays sharp on a retina display.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/brand/logo-128.png"
      alt=""
      aria-hidden
      width={128}
      height={128}
      className={className}
      /* It is decorative: every caller pairs it with the word ClearFunds. */
      decoding="async"
    />
  )
}

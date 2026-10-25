import { SAMPLE_DATA_ON } from '../lib/sample'

/*
 * SAYS, ON EVERY SCREEN, THAT THE FIGURES ARE NOT REAL.
 *
 * The product's rule is that no fabricated financial figure may appear,
 * because a plausible balance is indistinguishable from a real one and
 * these screens get screenshotted at an AGM. Sample data is allowed to
 * exist only while something on the page says so in words.
 *
 * So this is NOT a dismissable dev convenience. It renders above the
 * content on every route, it cannot be closed, and it is the same element
 * in a screenshot as it is on screen. A banner a developer can dismiss is
 * a banner that is missing from the screenshot that matters.
 *
 * It returns null when the switch is off, so turning sample data off
 * removes the banner in the same edit. The two can never disagree.
 *
 * `role="status"` rather than `alert`: it is a standing condition of the
 * page, not an event. An alert would interrupt a screen reader on every
 * navigation to say the same thing.
 *
 * The colours are LITERALS, not tokens, and that is deliberate. The
 * export's `tertiary-container` pair is #c76c00 on #2f1500 - a near-black
 * slab, correct in the export and wrong in a light theme. These two
 * measure 7.5:1, well clear of the text floor, and the 4px left border
 * carries the edge rather than a background difference (the warm ground
 * is only 1.06:1 against the page, which is not enough to see on its own).
 *
 * Literals are also the honest choice for a temporary element: a token
 * would imply this colour belongs to the design system, and this whole
 * file is deleted when the backend lands.
 */
export function SampleBanner() {
  if (!SAMPLE_DATA_ON) return null

  return (
    <div
      role="status"
      className="mb-space-md flex flex-col gap-space-xs rounded border-l-4 border-[#b35c00] bg-[#fff1e3] px-space-md py-space-sm text-[#7a3e00]"
    >
      <span className="font-body-md text-body-md font-semibold">
        Sample data — not a real society's accounts
      </span>
      <span className="font-body-sm text-body-sm">
        Every figure, flat, name and payee on this screen is invented, for
        checking the layout. Nothing here is a record of money. The
        fingerprint and record-check panels stay empty, because a made-up
        fingerprint could not be told apart from a real one.
      </span>
    </div>
  )
}

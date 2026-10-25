/**
 * Icons, as inline SVG.
 *
 * THE EXPORT USES MATERIAL SYMBOLS OUTLINED AND WE CANNOT.
 *
 * Every screen in the Stitch export writes icons as
 * `<span class="material-symbols-outlined">verified</span>`, a ligature
 * font loaded from `fonts.googleapis.com`. Three things rule that out
 * and only the first is about policy:
 *
 *   1. `font-src 'self'` blocks it. The failure is SILENT AND UGLY: the
 *      ligature never resolves, so every icon renders as its literal
 *      source text. A row meant to show a tick shows the word
 *      "verified", and the chain band shows "fingerprint".
 *   2. The full variable font is several hundred KB for the handful of
 *      glyphs used here.
 *   3. A ligature icon is a word in the accessibility tree. Screen
 *      readers announce the glyph name - a resident hears "verified
 *      Monthly Maintenance Q3 check circle".
 *
 * So the glyphs are inlined as paths, under the names the export uses.
 * Call sites stay recognisable against `code.html`: where it says
 * `verified`, this says `<Icon name="verified" />`.
 *
 * ARIA. These are decorative by default - `aria-hidden`, with the
 * meaning carried by adjacent text. Where an icon is the ONLY content
 * of a control, the control supplies the name with `cf-sr-only`, never
 * this element.
 *
 * NOTE ON WHITESPACE. An `aria-hidden` element contributes nothing to
 * the accessible name, INCLUDING the whitespace around it. `<Icon />
 * Verified` computes as "Verified", but an icon between two words
 * concatenates them. Keep icons at the edges of a label, not inside it.
 *
 * Paths are Material Symbols Outlined at weight 400, 24px grid,
 * normalised to a 0 0 24 24 viewBox.
 */

export type IconName =
  | 'verified'
  | 'warning'
  | 'menu'
  | 'close'
  | 'search'
  | 'download'
  | 'receipt_long'
  | 'picture_as_pdf'
  | 'fingerprint'
  | 'lock'
  | 'gavel'
  | 'account_balance'
  | 'groups'
  | 'description'
  | 'flag'
  | 'undo'
  | 'arrow_forward'
  | 'check_circle'
  | 'schedule'
  | 'error'
  | 'light_mode'
  | 'dark_mode'
  | 'grid_view'
  | 'home'

const PATHS: Record<IconName, string> = {
  verified:
    'm8.6 22.5-1.9-3.2-3.6-.8.35-3.7L1 12l2.45-2.8-.35-3.7 3.6-.8 1.9-3.2L12 2.95l3.4-1.45 1.9 3.2 3.6.8-.35 3.7L23 12l-2.45 2.8.35 3.7-3.6.8-1.9 3.2L12 21.05ZM11 15.55l5.65-5.65-1.4-1.45L11 12.7l-2.25-2.2-1.4 1.4Z',
  warning: 'M1 21 12 2l11 19Zm11-3q.425 0 .713-.288Q13 17.425 13 17t-.287-.712Q12.425 16 12 16t-.712.288Q11 16.575 11 17t.288.712Q11.575 18 12 18Zm-1-3h2v-5h-2Z',
  menu: 'M3 18v-2h18v2Zm0-5v-2h18v2Zm0-5V6h18v2Z',
  close:
    'M6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5l5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6Z',
  search:
    'M19.6 21 13.3 14.7q-.75.6-1.725.95Q10.6 16 9.5 16q-2.725 0-4.612-1.887Q3 12.225 3 9.5q0-2.725 1.888-4.613Q6.775 3 9.5 3t4.613 1.887Q16 6.775 16 9.5q0 1.1-.35 2.075-.35.975-.95 1.725L21 19.6ZM9.5 14q1.875 0 3.188-1.312Q14 11.375 14 9.5t-1.312-3.187Q11.375 5 9.5 5T6.313 6.313Q5 7.625 5 9.5t1.313 3.188Q7.625 14 9.5 14Z',
  download: 'M12 16 7 11l1.4-1.45 2.6 2.6V4h2v8.15l2.6-2.6L17 11Zm-6 4q-.825 0-1.412-.587Q4 18.825 4 18v-3h2v3h12v-3h2v3q0 .825-.587 1.413Q18.825 20 18 20Z',
  receipt_long:
    'M19 20H5V4h14ZM7 8h10V6H7Zm0 4h10v-2H7Zm0 4h7v-2H7ZM3 22V2h18v20l-3-1.5-3 1.5-3-1.5L9 22l-3-1.5Z',
  picture_as_pdf:
    'M5 21q-.825 0-1.412-.587Q3 19.825 3 19V5q0-.825.588-1.412Q4.175 3 5 3h14q.825 0 1.413.588Q21 4.175 21 5v14q0 .825-.587 1.413Q19.825 21 19 21Zm3-5h1.5v-2h1q.425 0 .713-.288.287-.287.287-.712v-2q0-.425-.287-.713Q10.925 10 10.5 10H8Zm1.5-3.5v-1h1v1Zm3.5 3.5h2.5q.425 0 .713-.288Q16.5 15.425 16.5 15v-4q0-.425-.287-.713Q15.925 10 15.5 10H13Z',
  fingerprint:
    'M12 2q3.5 0 6.05 2.3T21 10q0 .425-.288.712Q20.425 11 20 11t-.712-.288Q19 10.425 19 10q0-2.95-2.05-4.975Q14.9 3 12 3T7.05 5.025Q5 7.05 5 10q0 .425-.287.712Q4.425 11 4 11t-.712-.288Q3 10.425 3 10q0-3.4 2.55-5.7Q8.1 2 12 2Zm0 5q1.25 0 2.125.875T15 10v4q0 .425-.288.712Q14.425 15 14 15t-.712-.288Q13 14.425 13 14v-4q0-.425-.288-.713Q12.425 9 12 9t-.712.287Q11 9.575 11 10v6.5q0 .425-.288.712Q10.425 17.5 10 17.5t-.712-.288Q9 16.925 9 16.5V10q0-1.25.875-2.125T12 7Z',
  lock: 'M6 22q-.825 0-1.412-.587Q4 20.825 4 20V10q0-.825.588-1.412Q5.175 8 6 8h1V6q0-2.075 1.463-3.537Q9.925 1 12 1t3.538 1.463Q17 3.925 17 6v2h1q.825 0 1.413.588Q20 9.175 20 10v10q0 .825-.587 1.413Q18.825 22 18 22Zm6-5q.825 0 1.413-.587Q14 15.825 14 15t-.587-1.413Q12.825 13 12 13t-1.412.587Q10 14.175 10 15t.588 1.413Q11.175 17 12 17ZM9 8h6V6q0-1.25-.875-2.125T12 3q-1.25 0-2.125.875T9 6Z',
  gavel:
    'm15.7 11.3-7-7 1.4-1.4 1.1 1 2.5-2.5 5.6 5.6-2.5 2.5 1 1.1-1.4 1.4ZM3 22v-2h11v2Zm5.7-7.9-1.4-1.4 2.5-2.5-1-1.1 1.4-1.4 7 7-1.4 1.4-1.1-1Z',
  account_balance:
    'M4 19v-2h16v2Zm2-3v-6h2v6Zm5 0v-6h2v6Zm-9 5v-2h20v2Zm14-5v-6h2v6ZM2 8V6l10-5 10 5v2Z',
  groups:
    'M1 20v-1.4q0-1.05 1.075-1.7Q3.15 16.25 5 16.25q.337 0 .65.012.312.013.6.063-.35.525-.525 1.1-.175.575-.175 1.2V20Zm7 0v-1.375q0-.725.4-1.325t1.125-1.05q.725-.45 1.725-.675 1-.225 2.2-.225 1.225 0 2.225.225t1.725.675q.725.45 1.113 1.05.387.6.387 1.325V20Zm11.45 0v-1.375q0-.65-.162-1.225-.163-.575-.488-1.075.288-.05.588-.063.3-.012.612-.012 1.85 0 2.925.638Q24 17.525 24 18.6V20ZM5 15.5q-.825 0-1.412-.588Q3 14.325 3 13.5t.588-1.412Q4.175 11.5 5 11.5t1.412.588Q7 12.675 7 13.5t-.588 1.412Q5.825 15.5 5 15.5Zm14 0q-.825 0-1.413-.588Q17 14.325 17 13.5t.587-1.412Q18.175 11.5 19 11.5t1.413.588Q21 12.675 21 13.5t-.587 1.412Q19.825 15.5 19 15.5Zm-7-1.5q-1.25 0-2.125-.875T9 11q0-1.275.875-2.138Q10.75 8 12 8q1.275 0 2.138.862Q15 9.725 15 11q0 1.25-.862 2.125Q13.275 14 12 14Z',
  description:
    'M8 18h8v-2H8Zm0-4h8v-2H8Zm-2 8q-.825 0-1.412-.587Q4 20.825 4 20V4q0-.825.588-1.413Q5.175 2 6 2h8l6 6v12q0 .825-.587 1.413Q18.825 22 18 22Zm7-13V4H6v16h12V9Z',
  flag: 'M5 21V4h9l.4 2H20v10h-7l-.4-2H7v7Z',
  undo: 'M7 19v-2h7.1q1.575 0 2.738-1Q18 15 18 13.5q0-1.5-1.162-2.5-1.163-1-2.738-1H7.8l2.6 2.6L9 14 4 9l5-5 1.4 1.4L7.8 8h6.3q2.425 0 4.163 1.575Q20 11.15 20 13.5q0 2.35-1.737 3.925Q16.525 19 14.1 19Z',
  arrow_forward: 'm12 20-1.4-1.45 5.55-5.55H4v-2h12.15L10.6 5.45 12 4l8 8Z',
  check_circle:
    'm10.6 16.6 7.05-7.05-1.4-1.4-5.65 5.65-2.85-2.85-1.4 1.4ZM12 22q-2.075 0-3.9-.788-1.825-.787-3.175-2.137-1.35-1.35-2.137-3.175Q2 14.075 2 12t.788-3.9q.787-1.825 2.137-3.175 1.35-1.35 3.175-2.138Q9.925 2 12 2t3.9.787q1.825.788 3.175 2.138 1.35 1.35 2.138 3.175Q22 9.925 22 12t-.787 3.9q-.788 1.825-2.138 3.175-1.35 1.35-3.175 2.137Q14.075 22 12 22Z',
  schedule:
    'm15.3 16.7 1.4-1.4-3.7-3.7V7h-2v5.4ZM12 22q-2.075 0-3.9-.788-1.825-.787-3.175-2.137-1.35-1.35-2.137-3.175Q2 14.075 2 12t.788-3.9q.787-1.825 2.137-3.175 1.35-1.35 3.175-2.138Q9.925 2 12 2t3.9.787q1.825.788 3.175 2.138 1.35 1.35 2.138 3.175Q22 9.925 22 12t-.787 3.9q-.788 1.825-2.138 3.175-1.35 1.35-3.175 2.137Q14.075 22 12 22Z',
  error:
    'M12 17q.425 0 .713-.288Q13 16.425 13 16t-.287-.712Q12.425 15 12 15t-.712.288Q11 15.575 11 16t.288.712Q11.575 17 12 17Zm-1-4h2V7h-2Zm1 9q-2.075 0-3.9-.788-1.825-.787-3.175-2.137-1.35-1.35-2.137-3.175Q2 14.075 2 12t.788-3.9q.787-1.825 2.137-3.175 1.35-1.35 3.175-2.138Q9.925 2 12 2t3.9.787q1.825.788 3.175 2.138 1.35 1.35 2.138 3.175Q22 9.925 22 12t-.787 3.9q-.788 1.825-2.138 3.175-1.35 1.35-3.175 2.137Q14.075 22 12 22Z',
  light_mode:
    'M12 17q-2.075 0-3.537-1.463Q7 14.075 7 12t1.463-3.538Q9.925 7 12 7t3.538 1.462Q17 9.925 17 12q0 2.075-1.462 3.537Q14.075 17 12 17ZM2 13q-.425 0-.712-.288Q1 12.425 1 12t.288-.713Q1.575 11 2 11h2q.425 0 .713.287Q5 11.575 5 12t-.287.712Q4.425 13 4 13Zm18 0q-.425 0-.712-.288Q19 12.425 19 12t.288-.713Q19.575 11 20 11h2q.425 0 .712.287.288.288.288.713t-.288.712Q22.425 13 22 13ZM12 5q-.425 0-.712-.287Q11 4.425 11 4V2q0-.425.288-.713Q11.575 1 12 1t.713.287Q13 1.575 13 2v2q0 .425-.287.713Q12.425 5 12 5Zm0 18q-.425 0-.712-.288Q11 22.425 11 22v-2q0-.425.288-.712Q11.575 19 12 19t.713.288Q13 19.575 13 20v2q0 .425-.287.712Q12.425 23 12 23ZM5.65 7.05 4.575 6Q4.275 5.7 4.288 5.275q.012-.425.287-.725.3-.3.725-.3.425 0 .7.3L7.05 5.65q.275.3.275.712 0 .413-.275.688-.275.3-.687.287-.413-.012-.713-.287ZM18 19.425l-1.05-1.075q-.275-.3-.275-.712 0-.413.275-.688.275-.3.688-.287.412.012.712.287L19.425 18q.3.3.288.725-.013.425-.288.725-.3.3-.725.3-.425 0-.7-.325ZM16.95 7.05q-.3-.275-.287-.688.012-.412.287-.712L18 4.575q.3-.3.725-.288.425.013.725.288.3.3.3.725 0 .425-.3.7L18.35 7.05q-.3.275-.712.275-.413 0-.688-.275ZM4.575 19.425q-.3-.3-.3-.725 0-.425.3-.7l1.075-1.05q.3-.275.712-.275.413 0 .688.275.3.275.287.688-.012.412-.287.712L6 19.425q-.3.3-.725.287-.425-.012-.7-.287Z',
  dark_mode:
    'M12 21q-3.75 0-6.375-2.625T3 12q0-3.75 2.625-6.375T12 3q.35 0 .688.025.337.025.662.075-1.025.725-1.637 1.887Q11.1 6.15 11.1 7.5q0 2.25 1.575 3.825Q14.25 12.9 16.5 12.9q1.375 0 2.525-.613 1.15-.612 1.85-1.637.05.325.075.662Q21 11.65 21 12q0 3.75-2.625 6.375T12 21Z',
  grid_view:
    'M3 11V3h8v8Zm0 10v-8h8v8Zm10-10V3h8v8Zm0 10v-8h8v8Z',
  home: 'M6 19h3v-6h6v6h3v-9l-6-4.5L6 10Zm-2 2V9l8-6 8 6v12h-7v-6h-2v6Z',
}

export interface IconProps {
  readonly name: IconName
  /**
   * Rendered size in px. Defaults to 20, which sits on the 20px line
   * height of `body-md` without pushing the row taller.
   */
  readonly size?: number
  readonly className?: string
}

export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

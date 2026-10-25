import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { composite, contrastRatio } from './contrast'

/*
 * CONTRAST OVER THE SHIPPED STITCH PALETTE, BOTH THEMES.
 *
 * This replaces `tokens.contrast.test.ts`, which read `tokens.css` -
 * a stylesheet no longer imported by anything. That suite was green and
 * guarding a file that reached no resident, which is worse than having
 * no suite: it reported a palette as audited while the palette actually
 * shipping had never been measured. Four real defects were sitting
 * behind that green, three of them dark-theme text under 2:1.
 *
 * WHAT CHANGED IN SHAPE, AND WHY IT HAD TO.
 *
 * The old suite measured every token against two grounds and required
 * every one to clear the floor on both. Stitch's palette cannot be
 * checked that way, and the difference is not a loosening.
 *
 * Stitch is a Material-style palette: it names tokens in `on-X` / `X`
 * PAIRS, and an `on-X` colour is only ever placed on `X`. White
 * `on-primary` is 1.05:1 against the page surface and 17.16:1 against
 * `primary-container`, which is the only ground it is ever used on.
 * Demanding that it clear 4.5:1 against the page surface would demand
 * it be a colour it must not be - the test would be WRONG, and the
 * only way to make it pass would be to break the header.
 *
 * So this suite asserts the PAIRINGS THE COMPONENTS ACTUALLY RENDER,
 * enumerated below, each one a (text, ground) couple that exists in
 * the markup. That makes it stronger than a sweep in the way that
 * matters - it caught the header - and it carries one obligation a
 * sweep does not: a new pairing in a component must be added here, or
 * it is unmeasured. The guard for THAT is `pairs-are-current`, below.
 */

const LIGHT = readFileSync(resolve('src/styles/stitch.css'), 'utf8')
const INDEX = readFileSync(resolve('src/index.css'), 'utf8')

/** `--color-<name>: #hex` out of a block of CSS. */
function hexes(css: string): Map<string, string> {
  return new Map(
    [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map(
      (m) => [m[1]!, m[2]!],
    ),
  )
}

/**
 * The light palette: the generated Stitch values, with index.css's
 * corrections applied on top.
 *
 * The corrections have to be read, not assumed absent. `--color-outline`
 * ships from the config at #76777d, which is 4.25:1 - under the text
 * floor - and index.css overrides it. A reader of stitch.css alone
 * would measure the wrong palette and fail on a value nobody renders.
 */
function lightPalette(): Map<string, string> {
  const palette = hexes(LIGHT)
  // `:root` blocks in index.css, skipping the dark ramp (--cf-d-*).
  for (const m of INDEX.matchAll(/:root\s*\{([^}]*)\}/g)) {
    const body = m[1]!
    if (body.includes('--cf-d-')) continue
    for (const [name, hex] of hexes(body)) palette.set(name, hex)
  }
  return palette
}

/**
 * The dark palette: light, with the dark selector's overrides resolved
 * through the `--cf-d-*` ramp.
 *
 * THE RAMP IS READ RATHER THAN RESTATED. index.css declares each dark
 * value once in a `:root` block and both dark selectors reference it
 * with `var()`. A test holding its own copy of the hexes would pass
 * while the stylesheet was wrong - the failure the old suite's own
 * header warned about, and the reason it read the file.
 */
function darkPalette(): Map<string, string> {
  const palette = lightPalette()

  const rampBlock = [...INDEX.matchAll(/:root\s*\{([^}]*)\}/g)]
    .map((m) => m[1]!)
    .find((body) => body.includes('--cf-d-'))
  expect(rampBlock, 'no --cf-d-* ramp block in index.css').toBeDefined()

  const ramp = new Map(
    [...rampBlock!.matchAll(/--cf-d-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map(
      (m) => [m[1]!, m[2]!],
    ),
  )
  expect(ramp.size, 'the dark ramp is empty').toBeGreaterThan(10)

  /*
   * Take the LONGEST `[data-theme='dark']` block. There are two such
   * selectors: one sets `color-scheme` in three lines, the other
   * carries the ~30 overrides. Matching the first and measuring it
   * would silently measure the LIGHT palette twice and report both
   * themes passing - which is exactly what happened while these
   * numbers were being taken by hand.
   */
  const blocks = [
    ...INDEX.matchAll(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/g),
  ].map((m) => m[1]!)
  const overrides = blocks.sort((a, b) => b.length - a.length)[0]
  expect(
    overrides,
    'no [data-theme="dark"] override block found',
  ).toBeDefined()
  expect(
    overrides!.includes('--color-on-surface'),
    'the longest dark block carries no --color-on-surface; it is the color-scheme stub, not the overrides',
  ).toBe(true)

  for (const m of overrides!.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    const name = m[1]!
    const value = m[2]!.trim()
    if (value.startsWith('#')) {
      palette.set(name, value)
      continue
    }
    const ref = /^var\(--cf-d-([a-z0-9-]+)\)$/.exec(value)
    if (!ref) throw new Error(`dark --color-${name} is neither a hex nor a ramp var: ${value}`)
    const resolved = ramp.get(ref[1]!)
    if (!resolved) throw new Error(`dark --color-${name} references missing --cf-d-${ref[1]}`)
    palette.set(name, resolved)
  }
  return palette
}

const TEXT_MIN = 4.5
const GRAPHICAL_MIN = 3
/*
 * Not a WCAG number. A divider only owes being distinguishable from
 * its own ground; 1.00:1 is a line pointed at its own background,
 * which is the failure that actually occurs. See the `line` pairings.
 */
const LINE_MIN = 1.1

/**
 * Every (foreground, ground) pairing the components render.
 *
 * `kind` picks the floor: 4.5:1 for anything a resident reads,
 * 3:1 for a line or a border, which is a graphical object under
 * WCAG and is never allowed to carry text.
 */
interface Pair {
  readonly fg: string
  readonly bg: string
  /**
   * `text` - 4.5:1, anything a resident reads.
   * `graphical` - 3:1, a boundary or indicator they must perceive to
   *   operate something (WCAG 1.4.11).
   * `line` - visible at all. A decorative divider; see the block
   *   above the line pairings for why 3:1 is the wrong floor for it.
   */
  readonly kind: 'text' | 'graphical' | 'line'
  /** Where it renders. A pairing nobody renders does not belong here. */
  readonly where: string
}

const PAIRS: readonly Pair[] = [
  // --- the page surface, and the card surfaces on it ---
  { fg: 'on-surface', bg: 'surface', kind: 'text', where: 'body copy' },
  { fg: 'on-surface', bg: 'surface-container-lowest', kind: 'text', where: 'card body' },
  { fg: 'on-surface', bg: 'surface-container-low', kind: 'text', where: 'table head, rail status card' },
  { fg: 'on-surface', bg: 'surface-container', kind: 'text', where: 'active rail item' },
  { fg: 'on-surface-variant', bg: 'surface', kind: 'text', where: 'secondary copy' },
  { fg: 'on-surface-variant', bg: 'surface-container-lowest', kind: 'text', where: 'inactive rail item' },
  { fg: 'on-surface-variant', bg: 'surface-container-low', kind: 'text', where: 'card captions' },
  { fg: 'on-surface-variant', bg: 'surface-container', kind: 'text', where: 'hovered rail item' },

  /*
   * `outline` IS TEXT HERE, not a hairline. The export uses it for
   * every table header, every eyebrow label and the entry-range
   * caption - the smallest type on the screen. It shipped at 4.25:1
   * and index.css corrects it; this is the pairing that forces that.
   */
  { fg: 'outline', bg: 'surface', kind: 'text', where: 'eyebrow labels' },
  { fg: 'outline', bg: 'surface-container-lowest', kind: 'text', where: 'rail group headings' },
  { fg: 'outline', bg: 'surface-container-low', kind: 'text', where: 'table column headers' },

  // --- the money colours ---
  { fg: 'secondary', bg: 'surface-container-lowest', kind: 'text', where: 'credit amounts' },
  { fg: 'error', bg: 'surface-container-lowest', kind: 'text', where: 'debit amounts' },
  { fg: 'secondary', bg: 'surface', kind: 'text', where: 'credit amounts on the page ground' },
  { fg: 'error', bg: 'surface', kind: 'text', where: 'debit amounts on the page ground' },

  /*
   * THE THREE `*-fixed-variant` TOKENS. Each of these was under 2:1 in
   * dark until the ramp was fixed, because the dark block reassigned
   * `on-secondary-fixed-variant` and missed its two siblings. Thirteen
   * live sites: every "check this" link and every attention marker.
   */
  { fg: 'on-primary-fixed-variant', bg: 'surface', kind: 'text', where: 'fingerprint and verify links' },
  { fg: 'on-primary-fixed-variant', bg: 'surface-container-lowest', kind: 'text', where: 'verify links in cards' },
  { fg: 'on-tertiary-fixed-variant', bg: 'surface', kind: 'text', where: 'attention markers' },
  { fg: 'on-tertiary-fixed-variant', bg: 'surface-container-lowest', kind: 'text', where: 'unanswered flags' },
  { fg: 'on-error-container', bg: 'error-container', kind: 'text', where: 'the break notice' },
  { fg: 'on-secondary-fixed-variant', bg: 'secondary-fixed', kind: 'text', where: 'approved status pill' },

  /*
   * THE HEADER. `bg-primary-container text-on-primary` is the export's
   * own pairing, and in dark it put the society name at 1.05:1 -
   * present in the DOM, invisible on the screen. The header is where a
   * treasurer confirms WHICH society they are approving against.
   */
  { fg: 'on-primary', bg: 'primary-container', kind: 'text', where: 'header: society name, menu control' },
  { fg: 'on-primary-container', bg: 'primary-container', kind: 'text', where: 'header: eyebrow, role pill' },


  /*
   * KNOCKOUT LABELS: the page surface used as text on a filled shape.
   * `text-surface` reads as a mistake and is not one - on a
   * tertiary-fixed badge or a solid on-surface button it is the label.
   */
  { fg: 'surface', bg: 'on-surface', kind: 'text', where: 'the primary button on /login' },
  { fg: 'on-error', bg: 'error', kind: 'text', where: 'nav count badge' },

  /*
   * LINES, NEVER TEXT - and deliberately NOT held to 3:1.
   *
   * 3:1 is WCAG 1.4.11, and it applies to non-text content a user
   * must PERCEIVE TO OPERATE something: the boundary of a control, a
   * data line in a chart, a focus ring. A divider between two table
   * rows is not that. The rows are already separated by spacing, by
   * alignment and by the figures themselves; the rule is a grouping
   * hint, and if it disappeared the table would still be readable and
   * still be operable.
   *
   * Holding these to 3:1 would force a near-black hairline through
   * every card in both themes - Stitch ships them at 1.2-1.9:1, and
   * every Material palette does, because that is what a divider is
   * for. The test would be WRONG, and the only way to pass it would be
   * to damage the design.
   *
   * So what is asserted is what the token actually owes: that it is
   * VISIBLE AGAINST ITS GROUND AT ALL. 1.00:1 means someone pointed a
   * divider at its own background and the line silently vanished -
   * which is the real failure mode here, and the one that just
   * happened one pairing up, to a pill.
   *
   * The floor is low on purpose and the comment is the guard: nobody
   * should raise it to 3:1 without reading the paragraph above.
   */
  { fg: 'outline-variant', bg: 'surface', kind: 'line', where: 'dividers on the page ground' },
  { fg: 'outline-variant', bg: 'surface-container-lowest', kind: 'line', where: 'card dividers' },
  { fg: 'surface-container-high', bg: 'surface-container-lowest', kind: 'line', where: 'table row dividers' },
  { fg: 'surface-container-high', bg: 'surface-container-low', kind: 'line', where: 'the rail status card border' },
]

describe.each([
  ['light', lightPalette()],
  ['dark', darkPalette()],
])('%s palette', (themeName, palette) => {
  it('resolves every token the pairings name', () => {
    const missing = [
      ...new Set(PAIRS.flatMap((p) => [p.fg, p.bg])),
    ].filter((name) => !palette.has(name))
    expect(missing, `unresolved in ${themeName}`).toEqual([])
  })

  it.each(PAIRS.map((p) => [`${p.fg} on ${p.bg} (${p.where})`, p] as const))(
    '%s clears its floor',
    (_label, pair) => {
      const need =
        pair.kind === 'text'
          ? TEXT_MIN
          : pair.kind === 'graphical'
            ? GRAPHICAL_MIN
            : LINE_MIN
      const fg = palette.get(pair.fg)!
      const bg = palette.get(pair.bg)!
      const ratio = contrastRatio(fg, bg)
      expect(
        ratio,
        `${themeName}: ${pair.fg} ${fg} on ${pair.bg} ${bg} is ${ratio.toFixed(2)}:1, needs ${need}:1 (${pair.where})`,
      ).toBeGreaterThanOrEqual(need)
    },
  )

  /*
   * THE FADE TRAP, carried over intact from the suite this replaces.
   *
   * Opacity on quiet text is the easiest way to undo a contrast audit,
   * because in a diff it looks like styling rather than like changing a
   * colour.
   *
   * This deliberately does NOT assert that some exact opacity fails -
   * that was the old suite's first mistake, and it broke when the
   * palette gained headroom while nothing was actually wrong. It
   * FINDS the breaking point and asserts the point exists inside the
   * range a stylesheet would plausibly reach for. `opacity-50` and
   * `opacity-60` are ordinary Tailwind utilities; if one of them puts
   * quiet text under the floor, the no-fade rule is load-bearing and
   * this records why.
   */
  it('on-surface-variant breaks the text floor before it looks faint', () => {
    const fg = palette.get('on-surface-variant')!
    const bg = palette.get('surface')!

    expect(
      contrastRatio(fg, bg),
      'full strength already fails; the palette is broken and the rest of this says nothing',
    ).toBeGreaterThanOrEqual(TEXT_MIN)

    const steps = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]
    const firstFailure = steps.find(
      (alpha) => contrastRatio(composite(fg, bg, alpha), bg) < TEXT_MIN,
    )

    expect(
      firstFailure,
      'no opacity in the usable range breaks the floor, so the no-fade rule guards nothing and should be rewritten rather than kept',
    ).toBeDefined()

    /*
     * And the break is not so far down that a reader would see the
     * problem first. At 0.4 it is obviously faded; at 0.6 it is not,
     * which is the case the rule exists for.
     */
    expect(firstFailure!).toBeGreaterThanOrEqual(0.4)
  })
})

describe('the pairing list', () => {
  /*
   * THE LIST'S OWN WEAKNESS, GUARDED.
   *
   * Checking enumerated pairings instead of sweeping every token buys
   * correctness and costs completeness: a component that introduces a
   * new (text, ground) couple and does not add it here is unmeasured,
   * and nothing goes red.
   *
   * This cannot be fully closed without resolving Tailwind classes
   * against rendered DOM, which is a different kind of test. What it
   * CAN do is catch the cheap half: a `text-<token>` class naming a
   * colour that appears in no pairing at all. That is the shape the
   * dark-theme failure had - `text-on-tertiary-fixed-variant` was
   * rendered in six files and measured in none.
   */
  it('names every colour the components use as text', () => {
    const sources = import.meta.glob('../{components,routes}/**/*.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>

    // Measured AS TEXT. A colour appearing only as a `line` is not
    // measured for text, which is the stronger half of this check:
    // using a divider colour for a label passes a presence test and
    // fails this one.
    const measuredAsText = new Set(
      PAIRS.filter((p) => p.kind !== 'line').map((p) => p.fg),
    )
    const lineOnly = new Set(
      PAIRS.filter((p) => p.kind === 'line')
        .map((p) => p.fg)
        .filter((name) => !measuredAsText.has(name)),
    )
    const ground = new Set(PAIRS.map((p) => p.bg))

    /*
     * Tailwind's own scales share the `text-` prefix with colour -
     * `text-body-md` is a type step, `text-left` is alignment. Only
     * names that exist in the palette are colours, so the palette is
     * the filter. A type step is not in it and drops out.
     */
    const palette = lightPalette()
    const unmeasured = new Set<string>()

    for (const source of Object.values(sources)) {
      for (const m of source.matchAll(/\btext-([a-z][a-z0-9-]*)\b/g)) {
        const name = m[1]!
        if (!palette.has(name)) continue
        if (measuredAsText.has(name)) continue
        if (lineOnly.has(name)) {
          // Named explicitly, so the message says what is wrong rather
          // than just that something is missing.
          unmeasured.add(`${name} (a divider colour, used as text)`)
          continue
        }
        // A ground used as text somewhere unusual still needs a pairing,
        // so being a ground is not an excuse - but inverse surfaces are
        // paired by name and checked above.
        if (ground.has(name) && name.startsWith('inverse')) continue
        unmeasured.add(name)
      }
    }

    expect(
      [...unmeasured].sort(),
      'these colours are rendered as text but appear in no PAIRS entry, so their contrast is unmeasured; add a pairing naming the ground each one sits on',
    ).toEqual([])
  })
})

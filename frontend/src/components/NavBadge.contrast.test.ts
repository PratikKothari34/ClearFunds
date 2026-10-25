import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../styles/contrast'

/*
 * THE BADGE'S FILL, READ OUT OF THE BADGE'S OWN MARKUP.
 *
 * This replaces the half of `NavBadge.test.ts` that read `tokens.css`,
 * a stylesheet nothing imports any more.
 *
 * WHY IT READS THE CLASS NAMES INSTEAD OF NAMING THE COLOURS.
 *
 * The palette suite checks enumerated (text, ground) pairings, and it
 * cannot tell WHICH ground a given class sits on - that needs rendered
 * DOM. A mutation test found the hole exactly here: changing the badge
 * back to `bg-tertiary-fixed text-surface` (1.23:1, a count nobody can
 * read) left the palette suite green, because `surface` is legitimately
 * measured as text elsewhere and no entry said "surface on
 * tertiary-fixed".
 *
 * So this suite does the one thing that closes it: it pulls the
 * `bg-*` and `text-*` classes OFF THE BADGE ELEMENT in the source,
 * resolves both through the shipped palette, and measures the pair that
 * actually renders. Change either class to something illegible and
 * this goes red, which is the property that was missing.
 *
 * The badge is the only element in the design that puts text on a
 * saturated fill, so the pairing exists nowhere else to be checked.
 */

const SOURCE = readFileSync(resolve('src/components/NavBadge.tsx'), 'utf8')
const STITCH = readFileSync(resolve('src/styles/stitch.css'), 'utf8')
const INDEX = readFileSync(resolve('src/index.css'), 'utf8')

function hexes(css: string): Map<string, string> {
  return new Map(
    [...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)].map(
      (m) => [m[1]!, m[2]!],
    ),
  )
}

/** Light: generated Stitch values with index.css's corrections on top. */
function lightPalette(): Map<string, string> {
  const palette = hexes(STITCH)
  for (const m of INDEX.matchAll(/:root\s*\{([^}]*)\}/g)) {
    const body = m[1]!
    if (body.includes('--cf-d-')) continue
    for (const [name, hex] of hexes(body)) palette.set(name, hex)
  }
  return palette
}

/** Dark: light, with the override block resolved through the ramp. */
function darkPalette(): Map<string, string> {
  const palette = lightPalette()

  const ramp = new Map(
    [
      ...INDEX.matchAll(/--cf-d-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g),
    ].map((m) => [m[1]!, m[2]!]),
  )

  // The longest `[data-theme='dark']` block is the overrides; the other
  // only sets color-scheme. Taking the first would measure light twice.
  const overrides = [
    ...INDEX.matchAll(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/g),
  ]
    .map((m) => m[1]!)
    .sort((a, b) => b.length - a.length)[0]!

  for (const m of overrides.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    const name = m[1]!
    const value = m[2]!.trim()
    if (value.startsWith('#')) {
      palette.set(name, value)
      continue
    }
    const ref = /^var\(--cf-d-([a-z0-9-]+)\)$/.exec(value)
    if (ref) {
      const resolved = ramp.get(ref[1]!)
      if (resolved) palette.set(name, resolved)
    }
  }
  return palette
}

/**
 * The badge element's own `bg-` and `text-` colour classes.
 *
 * Scoped to the `aria-hidden` span, which is the visible pill. The
 * sibling `cf-sr-only` span is the accessible text and carries no
 * colour; matching the whole file would pick up whichever came first.
 */
function badgeClasses(): { fill: string; label: string } {
  const span = /aria-hidden="true"[\s\S]*?className="([^"]+)"/.exec(SOURCE)
  expect(
    span,
    'no aria-hidden span with a className in NavBadge.tsx; the badge markup moved and this test is measuring nothing',
  ).not.toBeNull()

  const classes = span![1]!.split(/\s+/)
  const palette = lightPalette()

  const fill = classes
    .map((c) => /^bg-([a-z0-9-]+)$/.exec(c)?.[1])
    .find((name) => name !== undefined && palette.has(name))
  const label = classes
    .map((c) => /^text-([a-z0-9-]+)$/.exec(c)?.[1])
    .find((name) => name !== undefined && palette.has(name))

  expect(fill, `no bg-<palette colour> on the badge: ${span![1]}`).toBeDefined()
  expect(
    label,
    `no text-<palette colour> on the badge: ${span![1]}`,
  ).toBeDefined()

  return { fill: fill!, label: label! }
}

describe('the count badge fill', () => {
  /*
   * 4.5:1, not the 3:1 a graphical object gets. THE DIGIT IS THE
   * INFORMATION - it is the number of approvals waiting - so it is
   * text, and the smallest text on the screen at that.
   */
  const MIN = 4.5

  const { fill, label } = badgeClasses()

  it.each([
    ['light', lightPalette()],
    ['dark', darkPalette()],
  ])('is legible in %s', (themeName, palette) => {
    const bg = palette.get(fill)
    const fg = palette.get(label)
    expect(bg, `${fill} unresolved in ${themeName}`).toBeDefined()
    expect(fg, `${label} unresolved in ${themeName}`).toBeDefined()

    const ratio = contrastRatio(fg!, bg!)
    expect(
      ratio,
      `${themeName}: the badge renders text-${label} ${fg} on bg-${fill} ${bg}, which is ${ratio.toFixed(2)}:1 and needs ${MIN}:1`,
    ).toBeGreaterThanOrEqual(MIN)
  })

  /*
   * THE FILL MUST NOT BE A PALE ONE. This is the specific failure that
   * a mechanical token sweep produced and that nothing caught: the old
   * attention colour mapped to Stitch's `tertiary-fixed`, a pale peach,
   * and a near-white label on it measured 1.23:1.
   *
   * A pale fill with a pale label is the shape of the bug, so the
   * assertion is that the fill separates from the PAGE as well - a
   * badge that melts into the surface it sits on is not a badge,
   * whatever its label does.
   */
  it.each([
    ['light', lightPalette()],
    ['dark', darkPalette()],
  ])('separates from the surface behind it in %s', (themeName, palette) => {
    const bg = palette.get(fill)!
    const behind = palette.get('surface-container-lowest')!
    const ratio = contrastRatio(bg, behind)
    expect(
      ratio,
      `${themeName}: the badge fill bg-${fill} ${bg} is only ${ratio.toFixed(2)}:1 against the rail ${behind}, so the pill itself is barely visible`,
    ).toBeGreaterThanOrEqual(3)
  })

  it('does not signal by colour alone', () => {
    /*
     * The pill is aria-hidden and a visually-hidden sibling carries the
     * count in words. Without that, the badge is a colour and a digit
     * with no accessible meaning - and this product's rule is that
     * colour never carries meaning by itself.
     */
    expect(SOURCE).toContain('cf-sr-only')
  })
})

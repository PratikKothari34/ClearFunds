import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { composite, contrastRatio } from './contrast'

/*
 * This suite reads tokens.css and checks the stylesheet itself. It
 * deliberately holds no copy of the hex values: a test carrying its own
 * palette passes while the shipped stylesheet is wrong, which is exactly
 * the failure that put 14 incorrect ratios in the design document.
 *
 * Text needs 4.5:1. --rule is a graphical object (hairlines, dividers)
 * and needs 3:1; it may never carry text.
 */

// Resolved from the project root, not from import.meta.url: the jsdom
// environment does not give this module a file: URL.
const CSS = readFileSync(resolve('src/styles/tokens.css'), 'utf8')

/**
 * Pull `--cf-<name>: #hex;` plus the ratios claimed in its comment.
 *
 * TWO GROUNDS MEANS TWO CLAIMS. A comment reads
 * `3.34:1 ground, 3.78:1 field`, and each number is checked against the
 * ground it names. The parser took a single ratio when there was a
 * single surface; left that way it would have read the first number and
 * silently ignored the second, so a wrong field ratio could sit in the
 * file looking computed. That is the exact failure this suite exists
 * for - the 14 unchecked numbers in the design document.
 */
function declarations(prefix: string) {
  const found = new Map<
    string,
    { hex: string; onGround: number | null; onField: number | null }
  >()
  const re = new RegExp(
    `--cf-${prefix}([a-z-]+):\\s*(#[0-9a-fA-F]{3,6})\\s*;` +
      `(?:\\s*/\\*\\s*([0-9.]+):1(?:\\s*ground,\\s*([0-9.]+):1\\s*field)?)?`,
    'g',
  )
  for (const m of CSS.matchAll(re)) {
    const [, name, hex, ground, fieldRatio] = m
    // The pattern cannot match without groups 1 and 2, but the compiler
    // does not know that and a silent skip would be worse than a throw.
    if (name === undefined || hex === undefined) {
      throw new Error(`unparsable token declaration: ${m[0]}`)
    }
    found.set(name, {
      hex,
      onGround: ground === undefined ? null : Number(ground),
      onField: fieldRatio === undefined ? null : Number(fieldRatio),
    })
  }
  return found
}

const TEXT_MIN = 4.5
const GRAPHICAL_MIN = 3
const GRAPHICAL = new Set(['rule'])

// Light tokens are the unprefixed --cf-*; dark are --cf-d-*. The light
// match would also catch --cf-d-ink, so drop anything re-found as dark.
const dark = declarations('d-')
const light = new Map(
  [...declarations('')].filter(([name]) => !name.startsWith('d-')),
)

describe.each([
  ['light', light] as const,
  ['dark', dark] as const,
])('%s theme', (themeName, tokens) => {
  const surface = tokens.get('surface')
  it('declares a surface', () => {
    expect(surface, `${themeName} has no --cf-surface`).toBeDefined()
  })

  /*
   * Ten tokens: TWO GROUNDS plus the eight that sit on them.
   *
   * Nine was the ceiling, and --cf-field argued its way past it with a
   * meaning none of the nine carried - a reading surface, as distinct
   * from the page ground. The list stays enumerated rather than
   * counted: a count still passes when a token is renamed, and an
   * enumeration does not.
   *
   * An eleventh was drafted and cut. A bind token for the bound edge
   * of the register duplicated --cf-rule, which already means a
   * graphical line; a bind differs from a rule in width, not colour.
   */
  it('declares exactly ten tokens', () => {
    expect([...tokens.keys()].sort()).toEqual([
      'anchor',
      'attention',
      'break',
      'credit',
      'debit',
      'field',
      'ink',
      'ink-quiet',
      'rule',
      'surface',
    ])
  })

  const fieldToken = tokens.get('field')
  it('declares a field', () => {
    expect(fieldToken, `${themeName} has no --cf-field`).toBeDefined()
  })

  /*
   * Both grounds are excluded from the threshold sweep. A ground is
   * what the other tokens are measured AGAINST, and measuring one
   * ground against the other says nothing: the lift between them is
   * deliberately far below any text threshold, because the field
   * separates from the ground by position, not by contrast.
   */
  const GROUNDS = new Set(['surface', 'field'])
  const onGround = [...tokens].filter(([name]) => !GROUNDS.has(name))

  /*
   * EVERY TOKEN IS CHECKED AGAINST BOTH GROUNDS, not just the surface.
   *
   * This is the assertion the second ground made necessary, and it is
   * strictly stronger than the one it replaced. Text sits on
   * --cf-field, so a token clearing 4.5:1 against the page ground and
   * failing against the field would have passed a surface-only check
   * while being unreadable exactly where it is read.
   *
   * It already caught one. --cf-d-rule was #626569: 3.03:1 on the dark
   * ground, passing the 3:1 graphical floor by 0.03, and 2.75:1 against
   * the raised dark field, which fails. Its own comment had called it
   * the least headroom in the palette.
   */
  it.each(onGround)(
    '%s clears its threshold on both grounds',
    (name, { hex }) => {
      const need = GRAPHICAL.has(name) ? GRAPHICAL_MIN : TEXT_MIN
      for (const [where, ground] of [
        ['ground', surface!.hex],
        ['field', fieldToken!.hex],
      ] as const) {
        const ratio = contrastRatio(hex, ground)
        expect(
          ratio,
          `--cf-${name} ${hex} on the ${where} ${ground} is ${ratio.toFixed(2)}:1, needs ${need}:1`,
        ).toBeGreaterThanOrEqual(need)
      }
    },
  )

  it.each(onGround)(
    '%s matches both ratios in its comment',
    (name, { hex, onGround: claimedGround, onField: claimedField }) => {
      // Two claims, both required. A token carrying only one number is
      // a token whose field ratio nobody computed.
      expect(
        claimedGround,
        `--cf-${name} has no ground ratio beside it; an unchecked token`,
      ).not.toBeNull()
      expect(
        claimedField,
        `--cf-${name} has no field ratio; the comment must read "<n>:1 ground, <n>:1 field"`,
      ).not.toBeNull()

      for (const [where, claimed, ground] of [
        ['ground', claimedGround!, surface!.hex],
        ['field', claimedField!, fieldToken!.hex],
      ] as const) {
        const actual = contrastRatio(hex, ground)
        // 0.01 because the comments carry two decimal places.
        expect(
          actual,
          `--cf-${name} claims ${claimed}:1 on the ${where}, actual ${actual.toFixed(2)}:1`,
        ).toBeCloseTo(claimed, 2)
      }
    },
  )
})

describe('the opacity trap', () => {
  /*
   * Opacity on --ink-quiet is the easiest way to undo the whole audit,
   * because it looks like styling rather than like changing a colour.
   *
   * THIS ASSERTED `opacity .7` AGAINST A FIXED EXPECTATION AND HAD TO
   * CHANGE SHAPE. The old test composited at exactly 0.7 and required
   * the result to FAIL the text floor - which was true of the palette
   * then in the file and is a measurement, not a rule. When the
   * palette moved to values with more headroom, .7 still passed and
   * the test failed while nothing was wrong: it was defending a
   * specific hex, not the principle.
   *
   * The principle is that a fade has a breaking point and it is
   * nearer than it looks. So the test now FINDS that point and
   * asserts it exists within the range a stylesheet would plausibly
   * use. `opacity-50` and `opacity-60` are ordinary Tailwind
   * utilities; if one of them puts quiet text under the floor, the
   * no-fade rule is load-bearing and this records why.
   *
   * It is deliberately NOT an assertion that some exact opacity
   * fails, which is the mistake being corrected.
   */
  it.each([
    ['light', light],
    ['dark', dark],
  ])('%s --ink-quiet is faded below the text floor well before it looks faint', (_n, t) => {
    const ink = t.get('ink-quiet')!.hex
    const ground = t.get('surface')!.hex

    // Full strength must pass, or the palette itself is broken and
    // the rest of this says nothing.
    expect(contrastRatio(ink, ground)).toBeGreaterThanOrEqual(TEXT_MIN)

    // Walk down until it fails. Every step is an opacity a stylesheet
    // could reach for.
    const steps = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]
    const firstFailure = steps.find(
      (a) => contrastRatio(composite(ink, ground, a), ground) < TEXT_MIN,
    )

    // There IS a breaking point inside the usable range - the rule
    // guards something real.
    expect(firstFailure).toBeDefined()

    /*
     * And it is not so far down that the text is obviously broken
     * first. At 0.4 a reader sees the problem; at 0.6 they do not,
     * which is the case the rule exists for. A palette whose quiet
     * ink survives 0.5 would need this rule rewritten rather than
     * quietly kept.
     */
    expect(firstFailure!).toBeGreaterThanOrEqual(0.4)
  })
})

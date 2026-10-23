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

/** Pull `--cf-<name>: #hex;` plus the `/* n:1 *\/` comment, if present. */
function declarations(prefix: string) {
  const found = new Map<string, { hex: string; claimed: number | null }>()
  const re = new RegExp(
    `--cf-${prefix}([a-z-]+):\\s*(#[0-9a-fA-F]{3,6})\\s*;(?:\\s*/\\*\\s*([0-9.]+):1)?`,
    'g',
  )
  for (const m of CSS.matchAll(re)) {
    const [, name, hex, claimed] = m
    // The pattern cannot match without groups 1 and 2, but the compiler
    // does not know that and a silent skip would be worse than a throw.
    if (name === undefined || hex === undefined) {
      throw new Error(`unparsable token declaration: ${m[0]}`)
    }
    found.set(name, {
      hex,
      claimed: claimed === undefined ? null : Number(claimed),
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

  // Nine tokens: surface plus the eight that sit on it. Nine is the
  // documented ceiling; a tenth needs a meaning none of these carries.
  it('declares exactly nine tokens', () => {
    expect([...tokens.keys()].sort()).toEqual([
      'anchor',
      'attention',
      'break',
      'credit',
      'debit',
      'ink',
      'ink-quiet',
      'rule',
      'surface',
    ])
  })

  const onSurface = [...tokens].filter(([name]) => name !== 'surface')

  it.each(onSurface)('%s clears its threshold', (name, { hex }) => {
    const need = GRAPHICAL.has(name) ? GRAPHICAL_MIN : TEXT_MIN
    const ratio = contrastRatio(hex, surface!.hex)
    expect(
      ratio,
      `--cf-${name} ${hex} on ${surface!.hex} is ${ratio.toFixed(2)}:1, needs ${need}:1`,
    ).toBeGreaterThanOrEqual(need)
  })

  it.each(onSurface)(
    '%s matches the ratio in its comment',
    (name, { hex, claimed }) => {
      expect(
        claimed,
        `--cf-${name} has no computed ratio beside it; an unchecked token`,
      ).not.toBeNull()
      const actual = contrastRatio(hex, surface!.hex)
      // 0.01 because the comments carry two decimal places.
      expect(
        actual,
        `--cf-${name} comment says ${claimed}:1, actual ${actual.toFixed(2)}:1`,
      ).toBeCloseTo(claimed!, 2)
    },
  )
})

describe('the opacity trap', () => {
  // The design names this as the easiest way to undo the whole audit:
  // opacity on --ink-quiet drops light to 3.11:1 and dark to 4.00:1, both
  // below the 4.5:1 text floor. The test records the measurement so the
  // rule cannot be softened by someone who thinks it has headroom.
  it.each([
    ['light', light],
    ['dark', dark],
  ])('%s --ink-quiet fails at opacity .7, so it is never faded', (_n, t) => {
    const faded = composite(t.get('ink-quiet')!.hex, t.get('surface')!.hex, 0.7)
    expect(contrastRatio(faded, t.get('surface')!.hex)).toBeLessThan(TEXT_MIN)
  })
})

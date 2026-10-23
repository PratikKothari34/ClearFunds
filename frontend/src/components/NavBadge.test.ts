import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../styles/contrast'

/*
 * The badge is the only place in the design where a token is used as a
 * FILL with text on top of it. Every ratio in tokens.css is computed
 * against the surface, so none of them says whether this pairing is
 * legible — it had to be computed separately, and it has to stay
 * computed, because a later palette edit would silently break it.
 *
 * Reading the hexes out of tokens.css rather than restating them is the
 * same rule the palette suite follows: a test carrying its own colours
 * passes while the shipped stylesheet is wrong.
 */

const TOKENS = readFileSync(resolve('src/styles/tokens.css'), 'utf8')

function token(name: string): string {
  const m = new RegExp(`--cf-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(TOKENS)
  if (!m?.[1]) throw new Error(`--cf-${name} not found in tokens.css`)
  return m[1]
}

describe('the attention badge fill', () => {
  // Small text on a coloured fill: 4.5:1, not the 3:1 that graphical
  // objects get. The digit IS the information.
  const MIN = 4.5

  it('is legible in light, with surface-coloured text', () => {
    expect(contrastRatio(token('attention'), token('surface'))).toBeGreaterThan(
      MIN,
    )
  })

  it('is legible in dark, with surface-coloured text', () => {
    expect(
      contrastRatio(token('d-attention'), token('d-surface')),
    ).toBeGreaterThan(MIN)
  })

  it('would NOT be legible with ink text, which is why it is not used', () => {
    // Recorded as a test so the pairing is not "tidied up" later by
    // someone matching the badge to the body colour.
    expect(contrastRatio(token('d-attention'), token('d-ink'))).toBeLessThan(MIN)
  })
})

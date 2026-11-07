/*
 * THE SEAL, AS A RESIDENT ACTUALLY SEES IT.
 *
 * The first render test in the tree, and it exists because the bug it guards
 * lived in JSX, where 361 passing unit tests structurally could not reach it:
 *
 *   <Chip tone={y.closed ? 'anchor' : 'neutral'}>{y.closed ? 'Year closed' : 'Open'}</Chip>
 *
 * A year closed with an ADVERSE opinion, or with a DISCLAIMER - the auditor
 * could not form an opinion at all - rendered in `anchor`, the reassuring
 * checked-against tone, with the opinion appearing nowhere on that screen. The
 * row carried `headline` the whole time.
 *
 * Testing opinionTone alone could not catch it, because the defect was that
 * the route never called opinionTone. So this renders the real Chip through
 * the real helpers and asserts on the resulting element: the reassuring tone
 * is reserved for a clean opinion, and the chip is never empty.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Chip } from './ui'
import { opinionChip, opinionTone } from '../lib/format'
import type { Opinion } from '../lib/types'

const LEDGER = resolve(__dirname, '../../../contracts/chain/kinds/ledger.v1.md')

/** The contract's own ranking, so a value added there reaches this test. */
const ranked: Opinion[] = (() => {
  const line = readFileSync(LEDGER, 'utf8').split('\n').find((l) => /^\|\s*\d+\s*\|\s*`opinion`/.test(l))
  if (!line) throw new Error('no `opinion` row in the contract')
  const vs = [...line.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!).filter((v) => v !== 'opinion')
  if (vs.length < 4) throw new Error(`the contract lists ${vs.length} opinions, not a ranking: ${line}`)
  return vs as Opinion[]
})()

/** What a closed year renders, exactly as both screens now build it. */
function sealFor(o: Opinion | null) {
  const { container } = render(<Chip tone={opinionTone(o)}>{opinionChip(o)}</Chip>)
  const el = container.firstElementChild
  if (!el) throw new Error('the chip rendered nothing at all')
  return el
}

describe('the chip a resident sees on a closed year', () => {
  it('shows the reassuring tone for a clean opinion, and for nothing else', () => {
    // The class is asserted rather than the tone name, because the tone name
    // is what the route passes and the class is what the resident sees.
    const clean = sealFor('clean')
    expect(clean.className).toContain('anchor')

    for (const o of [...ranked.filter((v) => v !== 'clean'), null] as (Opinion | null)[]) {
      const el = sealFor(o)
      expect(el.className, `${String(o)} rendered in the reassuring tone`).not.toContain('anchor')
    }
  })

  it('never renders an empty chip, whatever the opinion is', () => {
    for (const o of [...ranked, null] as (Opinion | null)[]) {
      const el = sealFor(o)
      expect(el.textContent?.trim(), `${String(o)} rendered blank`).toBeTruthy()
    }
  })

  it('does not label an unrecorded opinion as any real one', () => {
    const absent = sealFor(null).textContent?.trim()
    for (const o of ranked) {
      expect(absent, 'an absent opinion claimed a specific one').not.toBe(sealFor(o).textContent?.trim())
    }
  })

  it('renders the opinion as text, not only as a colour', () => {
    /* Colour alone is never a signal in this product. Each opinion must be
     * readable, so the ranking is legible to someone who cannot see the tone. */
    for (const o of ranked) {
      render(<Chip tone={opinionTone(o)}>{opinionChip(o)}</Chip>)
      expect(screen.getAllByText(new RegExp(o, 'i')).length, `${o} was not named in words`).toBeGreaterThan(0)
    }
  })
})

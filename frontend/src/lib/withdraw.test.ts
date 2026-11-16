/**
 * WITHDRAWING A PROPOSAL IS IRREVERSIBLE AND THROWS AWAY SIGNATURES.
 *
 * Withdraw fired straight into `mutateAsync` on a single click, while Approve
 * had a two-step confirm and Decline had a sheet - and withdrawing is the one
 * of the three that cannot be undone. `api_withdraw` appends
 * `proposal_closed`/`withdrawn` and refuses on anything but an open proposal,
 * so there is no re-open path: a new proposal takes a new sequence and starts
 * at zero approvals. On the seeded society the treasurer's open #4241 carried
 * six approvals behind that click.
 *
 * Tests the function that DECIDES what is at stake, not the sheet that shows
 * it.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { withdrawStake } from './withdraw'

describe('withdrawStake', () => {
  it('THE DEFECT: names the signatures that will be lost', () => {
    const s = withdrawStake(6)
    expect(s.known).toBe(true)
    expect(s.message).toMatch(/6 approvals already signed/)
    expect(s.message).toMatch(/cannot be undone/i)
  })

  it('says a new entry number is needed, since the proposal cannot come back', () => {
    // The part a proposer is most likely to get wrong: withdrawing feels like
    // editing, and it is not - the old sequence stays closed for good.
    expect(withdrawStake(3).message).toMatch(/new entry number/i)
  })

  it('reads as one signature, not "1 approvals"', () => {
    const m = withdrawStake(1).message
    expect(m).toMatch(/1 approval already signed/)
    expect(m).not.toMatch(/1 approvals/)
    expect(m).toMatch(/signature again/)
  })

  it('does not claim signatures exist when none do, but still warns', () => {
    const s = withdrawStake(0)
    expect(s.known).toBe(true)
    expect(s.message).toMatch(/No approvals have been signed/i)
    // Still irreversible with zero approvals, so the warning must remain.
    expect(s.message).toMatch(/cannot be undone/i)
  })

  it('THE OTHER DEFECT: an unreadable count must not read as zero', () => {
    /*
     * `approve_count ?? 0` would tell the proposer that nothing is at stake
     * at the exact moment that claim is false. Same shape as `null <= 0`: a
     * fallback indistinguishable from a real answer.
     */
    for (const bad of [undefined, null, NaN, -1, 2.5, '6', {}]) {
      const s = withdrawStake(bad)
      expect(s.known, String(bad)).toBe(false)
      expect(s.message, String(bad)).not.toMatch(/No approvals/i)
      expect(s.message, String(bad)).toMatch(/any approvals already signed/i)
      expect(s.message, String(bad)).toMatch(/cannot be undone/i)
    }
  })

  it('every outcome warns that it cannot be undone', () => {
    // The one claim that is true in all three branches. Asserting the rule
    // rather than any sample count.
    for (const c of [0, 1, 6, 11, undefined]) {
      expect(withdrawStake(c).message, String(c)).toMatch(/cannot be undone/i)
    }
  })

  it('formats a large count in the Indian grouping', () => {
    expect(withdrawStake(100000).message).toMatch(/1,00,000/)
  })
})

/*
 * THAT THE SCREEN USES IT. Every case above passes on the broken screen,
 * which withdrew on the click with no confirmation at all.
 */
describe('the approvals screen is wired to it', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'routes', 'approvals.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('THE DEFECT: the Withdraw button opens a confirmation, it does not withdraw', () => {
    /*
     * The heart of it. The button must not call the mutation directly - that
     * is the state the bug was found in, and it is invisible to any test of
     * withdrawStake alone.
     */
    const btn = /Withdraw my proposal/.exec(src)
    expect(btn).not.toBeNull()
    const before = src.slice(Math.max(0, (btn?.index ?? 0) - 400), btn?.index)
    expect(before).toMatch(/setWithdrawOpen\(true\)/)
    expect(before).not.toMatch(/withdraw\.mutateAsync/)
  })

  it('asks withdrawStake what is at stake, from the server count', () => {
    expect(src).toMatch(/withdrawStake\(p\.approve_count\)/)
  })

  it('shows the answer rather than a fixed sentence', () => {
    expect(src).toMatch(/stake\.message/)
  })

  it('does not paper over a missing count with a zero default', () => {
    // `approve_count ?? 0` or `|| 0` at the call site would defeat the
    // unreadable branch entirely.
    expect(src).not.toMatch(/approve_count\s*(\?\?|\|\|)/)
  })

  it('still performs the withdrawal from the confirmation', () => {
    expect(src).toMatch(/withdraw\.mutateAsync\(p\.seq\)/)
  })
})

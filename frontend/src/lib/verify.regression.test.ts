/*
 * THE RELABEL FORGERY, DRIVEN THROUGH runCheck.
 *
 * verify.unchecked.test.ts calls verdict() with a hand-built Check, so it
 * proves what the screen SAYS once regressed is known. It cannot prove how
 * regressed is computed - and that computation is the guard. Mutating the
 * bound, letting checkedThrough slide backwards, or overwriting the memory
 * that holds the evidence all left those tests green.
 *
 * So these tests run the real two-visit sequence against real localStorage:
 * an honest visit that records what was covered, then a visit where the
 * server relabels an already-verified entry, rewrites its body and reports
 * the entry's original hash. Every later hash still matches, so this is the
 * only thing standing between that and a 'warn'.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { preimage, sha256, hex, type Entry } from './chain'

const chain = vi.hoisted(() => ({ entries: [] as Entry[] }))
vi.mock('./api', () => ({ fetchChain: async () => chain.entries }))

const { runCheck, verdict } = await import('./verify')

const ZERO = '0'.repeat(64)
const SOCIETY = 'test-society'

const posting = (n: number, minor: number) => ({
  kind: 'posting',
  body: { proposal_seq: n, effect: 'debit', amount_minor: minor, currency: 'INR',
    limit_minor: null, person: null, role: null, derived: null },
})

/** Build a correctly linked chain from kind/body pairs. */
async function build(specs: { kind: string; body: Record<string, unknown> }[]): Promise<Entry[]> {
  const out: Entry[] = []
  let prev = ZERO
  for (const [i, s] of specs.entries()) {
    const e: Entry = { format_version: 1, society_id: SOCIETY, sequence: i + 1, prev_hash: prev,
      kind: s.kind, recorded_at: 1700000000000 + i, actor: null, body: s.body }
    prev = hex(await sha256(preimage(e)))
    out.push(e)
  }
  return out
}

const honestSpecs = [posting(1, 500000), posting(2, 900000), posting(3, 250000)]

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
  // No anchor configured: the forgery must be caught without one, because a
  // relabel leaves the published head unchanged and the anchor still matches.
  vi.stubEnv('VITE_ANCHOR_URL', '')
})

describe('an already-verified entry that becomes unreadable', () => {
  it('is reported as tampering, not as an unrecognised kind', async () => {
    chain.entries = await build(honestSpecs)
    const first = await runCheck(SOCIETY)
    expect(first.regressed).toEqual([])
    expect(verdict(first).tone).not.toBe('break')

    /*
     * The forgery. Entry 2's amount is rewritten, its kind is changed to one
     * this build has no layout for, and entry_hash reports the ORIGINAL hash
     * so every later link still resolves.
     */
    const forged = await build(honestSpecs)
    const trueHash = first.head.seq === 3 ? hex(await sha256(preimage(forged[1]!))) : ''
    forged[1] = { ...forged[1]!, kind: 'posting_v2',
      body: { ...forged[1]!.body, amount_minor: 100 }, entry_hash: trueHash }
    chain.entries = forged

    const second = await runCheck(SOCIETY)
    // The head is untouched - that is what makes this forgery work at all.
    expect(second.head.hash).toBe(first.head.hash)
    expect(second.unchecked).toContain(2)
    expect(second.regressed).toContain(2)
    expect(verdict(second).tone).toBe('break')
  })

  it('keeps breaking on every later visit, because the evidence is not overwritten', async () => {
    /*
     * The memory holding checkedThrough must not be rewritten by the very
     * visit that detects the forgery. If it were, the NEXT visit would read a
     * lowered bound, find nothing regressed, and quietly downgrade to a warn
     * - the forgery would only ever be reported once.
     */
    chain.entries = await build(honestSpecs)
    await runCheck(SOCIETY)

    const forged = await build(honestSpecs)
    forged[1] = { ...forged[1]!, kind: 'posting_v2',
      body: { ...forged[1]!.body, amount_minor: 100 },
      entry_hash: hex(await sha256(preimage((await build(honestSpecs))[1]!))) }
    chain.entries = forged

    expect(verdict(await runCheck(SOCIETY)).tone).toBe('break')
    expect(verdict(await runCheck(SOCIETY)).tone).toBe('break')
    expect(verdict(await runCheck(SOCIETY)).tone).toBe('break')
  })
})

  it('catches a relabel of the HIGHEST entry this phone had checked', async () => {
    /*
     * The boundary itself. checkedThrough is inclusive: entry 3 of a
     * three-entry chain WAS recomputed, so relabelling entry 3 is tampering.
     * A bound of `n < coveredBefore` instead of `<=` lets exactly this one
     * through, and it is the newest entry - the one a committee would most
     * want to rewrite.
     */
    chain.entries = await build(honestSpecs)
    const first = await runCheck(SOCIETY)
    expect(first.head.seq).toBe(3)

    const honest = await build(honestSpecs)
    const forged = await build(honestSpecs)
    forged[2] = { ...forged[2]!, kind: 'posting_v2',
      body: { ...forged[2]!.body, amount_minor: 100 },
      entry_hash: hex(await sha256(preimage(honest[2]!))) }
    chain.entries = forged

    const c = await runCheck(SOCIETY)
    expect(c.regressed).toContain(3)
    expect(verdict(c).tone).toBe('break')
  })

  it('still catches the forgery after the forged visit itself, on a later visit', async () => {
    /*
     * The detecting visit must not damage the bound it used.
     *
     * On the forged visit the entries only recompute up to sequence 1, so a
     * naive checkedThrough would store 1 - and the memory write must be
     * skipped anyway because this visit is evidence. If either goes wrong the
     * stored bound falls from 3 to 1, and a LATER visit that relabels entry 2
     * or 3 finds nothing regressed and downgrades to a warn. The forgery
     * would be reported once and then forgotten.
     */
    chain.entries = await build(honestSpecs)
    await runCheck(SOCIETY)

    const honest = await build(honestSpecs)
    const forged = await build(honestSpecs)
    forged[1] = { ...forged[1]!, kind: 'posting_v2',
      body: { ...forged[1]!.body, amount_minor: 100 },
      entry_hash: hex(await sha256(preimage(honest[1]!))) }
    chain.entries = forged
    expect(verdict(await runCheck(SOCIETY)).tone).toBe('break')

    // A different entry is relabelled on a subsequent visit. Entry 3 sits
    // above the bound a damaged memory would hold (1) and at/below the real
    // one (3), so only an intact bound catches it.
    const later = await build(honestSpecs)
    later[2] = { ...later[2]!, kind: 'posting_v2',
      body: { ...later[2]!.body, amount_minor: 100 },
      entry_hash: hex(await sha256(preimage(honest[2]!))) }
    chain.entries = later

    const c = await runCheck(SOCIETY)
    expect(c.regressed).toContain(3)
    expect(verdict(c).tone).toBe('break')
  })

  it('never lowers the stored bound, even on an honest visit it cannot fully check', async () => {
    /*
     * Same failure without any forgery: a legitimately new kind at sequence 2
     * of a longer chain means this visit recomputes only entry 1. If that
     * overwrote the bound with 1, the coverage this phone genuinely has would
     * be retired by a routine backend upgrade, and every entry below would
     * become relabel-able from then on.
     */
    chain.entries = await build(honestSpecs)
    await runCheck(SOCIETY)

    const honest = await build(honestSpecs)
    const withNew = await build(honestSpecs)
    // An honest new kind low in the chain: reports its own true hash.
    withNew[1] = { ...withNew[1]!, kind: 'something_newer',
      entry_hash: hex(await sha256(preimage(withNew[1]!))) }
    chain.entries = withNew
    await runCheck(SOCIETY)

    // Now relabel entry 3, which the phone did recompute on visit 1.
    const forged = await build(honestSpecs)
    forged[2] = { ...forged[2]!, kind: 'posting_v2',
      body: { ...forged[2]!.body, amount_minor: 100 },
      entry_hash: hex(await sha256(preimage(honest[2]!))) }
    chain.entries = forged

    const c = await runCheck(SOCIETY)
    expect(c.regressed).toContain(3)
    expect(verdict(c).tone).toBe('break')
  })

describe('an entry that is genuinely new', () => {
  it('is a warning, not tampering, when it sits above what was checked', async () => {
    chain.entries = await build(honestSpecs)
    await runCheck(SOCIETY)

    // A fourth entry arrives in a kind this build does not know yet.
    const grown = await build([...honestSpecs, posting(4, 100000)])
    grown[3] = { ...grown[3]!, kind: 'something_newer',
      entry_hash: hex(await sha256(preimage(grown[3]!))) }
    chain.entries = grown

    const c = await runCheck(SOCIETY)
    expect(c.unchecked).toEqual([4])
    expect(c.regressed).toEqual([])
    expect(verdict(c).tone).toBe('warn')
  })

  it('does not lower the bound, so a relabel below it is still caught later', async () => {
    /*
     * This is the mutant that survived verdict()-only tests: if an unchecked
     * entry at 4 drops checkedThrough from 3 to 3 is fine, but a LOWER
     * unchecked entry must not retire the coverage already established.
     * Visit 2 sees a new kind at 4; visit 3 relabels entry 2.
     */
    chain.entries = await build(honestSpecs)
    await runCheck(SOCIETY)

    const grown = await build([...honestSpecs, posting(4, 100000)])
    grown[3] = { ...grown[3]!, kind: 'something_newer',
      entry_hash: hex(await sha256(preimage(grown[3]!))) }
    chain.entries = grown
    expect(verdict(await runCheck(SOCIETY)).tone).toBe('warn')

    const forged = await build([...honestSpecs, posting(4, 100000)])
    const honestTwo = (await build(honestSpecs))[1]!
    forged[1] = { ...forged[1]!, kind: 'posting_v2',
      body: { ...forged[1]!.body, amount_minor: 100 },
      entry_hash: hex(await sha256(preimage(honestTwo))) }
    forged[3] = { ...forged[3]!, kind: 'something_newer',
      entry_hash: hex(await sha256(preimage(forged[3]!))) }
    chain.entries = forged

    const c = await runCheck(SOCIETY)
    expect(c.regressed).toContain(2)
    expect(verdict(c).tone).toBe('break')
  })
})

describe('a phone with no memory of this society', () => {
  it('warns rather than breaking, because there is nothing to compare against', async () => {
    /*
     * The residual gap, stated honestly: on a first-ever load an unrecognised
     * entry cannot be distinguished from a relabel. It must not claim to be
     * sound, and it must not accuse - hence warn, with wording that says the
     * contents were not checked.
     */
    const forged = await build(honestSpecs)
    forged[1] = { ...forged[1]!, kind: 'posting_v2',
      entry_hash: hex(await sha256(preimage(forged[1]!))) }
    chain.entries = forged

    const c = await runCheck(SOCIETY)
    expect(c.regressed).toEqual([])
    const v = verdict(c)
    expect(v.tone).toBe('warn')
    expect(v.line).toMatch(/not checked/)
  })
})

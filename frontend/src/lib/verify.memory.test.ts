/*
 * A CORRUPTED DEVICE MEMORY, DRIVEN THROUGH runCheck.
 *
 * `cf-seen:` is the only thing that distinguishes a relabelled entry from an
 * honest version gap, and it lives in localStorage: it outlives the visit, on
 * a device that may be shared, writable by any script that ever runs on this
 * origin. It used to be read with a cast.
 *
 * Two outcomes were worse than a crash would have been. A value that is not
 * an object made the device check report 'consistent' - positive confirmation
 * that nothing changed - and the relabelled entry then fell through to the
 * 'warn' branch and read as a routine "update the app" version gap. And a
 * NaN coverage bound disabled regression detection, then round-tripped
 * through JSON as null so the bound DROPPED on the next visit.
 *
 * So these drive the real entry point across visits, with real localStorage,
 * and assert on the SECOND visit - the one that has to catch the forgery.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { preimage, sha256, hex, type Entry } from './chain'

const chain = vi.hoisted(() => ({ entries: [] as Entry[] }))
vi.mock('./api', () => ({ fetchChain: async () => chain.entries }))

const { asMemory, runCheck, verdict } = await import('./verify')

const ZERO = '0'.repeat(64)
const SOCIETY = 'test-society'
const memKey = `cf-seen:${SOCIETY}`

const posting = (n: number, minor: number) => ({
  kind: 'posting',
  body: { proposal_seq: n, effect: 'debit', amount_minor: minor, currency: 'INR',
    limit_minor: null, person: null, role: null, derived: null },
})

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

const honest = [posting(1, 500000), posting(2, 900000), posting(3, 250000)]

/*
 * The forgery: entry 2 relabelled to a kind this build has no layout for,
 * its body rewritten, and `entry_hash` reporting the ORIGINAL hash so every
 * later link still resolves and the head is unchanged. Without the reported
 * hash the chain simply fails to recompute, which is a different (and
 * already-caught) case.
 */
const relabelled = async () => {
  const good = await build(honest)
  const forged = await build(honest)
  forged[1] = { ...forged[1]!, kind: 'cf_kind_from_the_future',
    body: { ...forged[1]!.body, amount_minor: 1 },
    entry_hash: hex(await sha256(preimage(good[1]!))) }
  return { good, forged }
}

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.stubEnv('VITE_ANCHOR_URL', '')
})

/** A memory in exactly the shape runCheck writes. */
const good = { seq: 3, hash: 'a'.repeat(64), at: 1700000000000, checkedThrough: 3 }

describe('asMemory', () => {
  it('accepts a memory this module wrote', () => {
    expect(asMemory(good)).toEqual(good)
  })

  it('accepts one with no coverage bound, which older clients wrote', () => {
    // Absent is an older shape, not corruption: refusing it would throw away
    // the device check for everyone who upgraded.
    const { checkedThrough: _omitted, ...older } = good
    expect(asMemory(older)).toEqual(older)
  })

  it('refuses anything that is not an object', () => {
    // The 'consistent' path: mem.seq on a non-object is undefined, and
    // undefined === undefined reads as a match.
    for (const v of [7, 'x', [], null, undefined, true]) {
      expect(asMemory(v), `accepted ${JSON.stringify(v) ?? 'undefined'}`).toBeNull()
    }
  })

  it('refuses an array even when it carries every field', () => {
    /*
     * A bare [] is caught by the seq check further down, so that case does
     * not prove the array guard does anything. One carrying the right
     * properties passes every later check, and `.length` would then be read
     * as a field name a future version might use. Refuse the shape, not just
     * the values.
     */
    expect(asMemory(Object.assign([], good))).toBeNull()
  })

  it('refuses a coverage bound that is not a whole count', () => {
    // NaN is the one that disabled detection outright: n <= NaN is false for
    // every n, and Math.max(NaN, x) is NaN.
    for (const t of [Number.NaN, Infinity, -1, 1.5, '3', null]) {
      expect(asMemory({ ...good, checkedThrough: t }), `accepted ${String(t)}`).toBeNull()
    }
  })

  it('refuses a sequence or hash it cannot act on', () => {
    for (const bad of [
      { seq: 0 }, { seq: -1 }, { seq: 1.5 }, { seq: Number.NaN }, { seq: '3' },
      { hash: '' }, { hash: 7 }, { hash: null }, { at: Number.NaN }, { at: '0' },
    ]) {
      expect(asMemory({ ...good, ...bad }), `accepted ${JSON.stringify(bad)}`).toBeNull()
    }
  })
})

describe('a memory that cannot be read', () => {
  it('makes no claim about the device rather than a false one', async () => {
    chain.entries = await build(honest)
    localStorage.setItem(memKey, '7')
    const c = await runCheck(SOCIETY)
    // 'consistent' is a claim this phone cannot support. 'first' is the truth.
    expect(c.device).toBe('first')
  })

  it('still reports a relabelled entry as tampering, not as a version gap', async () => {
    /*
     * The whole point. An honest visit records coverage; the memory is then
     * corrupted; the forged chain arrives. Reading 'consistent' off the
     * corrupt memory used to send this to the 'warn' branch.
     */
    const { good, forged } = await relabelled()
    chain.entries = good
    const first = await runCheck(SOCIETY)
    expect(first.regressed).toEqual([])

    // Corruption that preserves the coverage bound: the evidence survives.
    const saved = JSON.parse(localStorage.getItem(memKey)!)
    localStorage.setItem(memKey, JSON.stringify({ ...saved, hash: 'b'.repeat(64) }))

    chain.entries = forged
    const second = await runCheck(SOCIETY)
    expect(second.unchecked).toContain(2)
    expect(second.regressed).toContain(2)
    expect(verdict(second).tone).toBe('break')
  })

  it('never reports a NaN or null coverage bound back into storage', async () => {
    chain.entries = await build(honest)
    localStorage.setItem(memKey, JSON.stringify({ seq: 3, hash: 'a'.repeat(64), at: 0, checkedThrough: Number.NaN }))
    await runCheck(SOCIETY)
    const written = localStorage.getItem(memKey)
    expect(written).not.toContain('null')
    expect(written).not.toContain('NaN')
    expect(asMemory(JSON.parse(written!))).not.toBeNull()
  })

  it('does not lower a bound that was already higher', async () => {
    /*
     * The bound only ever rises. A corrupt memory must not be treated as a
     * lower bound either - it is discarded, and this visit's own coverage is
     * what gets recorded, so the next visit is not told it covered less than
     * it did.
     */
    chain.entries = await build(honest)
    await runCheck(SOCIETY)
    const after = asMemory(JSON.parse(localStorage.getItem(memKey)!))
    expect(after?.checkedThrough).toBe(honest.length)
  })
})

describe('the entry this phone recorded is no longer there', () => {
  it('counts a missing hash as a change, never as a match', async () => {
    /*
     * A shorter chain leaves hashes[seq - 1] undefined. `undefined ===
     * mem.hash` is false for a real hash, but the guard is explicit because
     * the failure mode of getting it wrong is a green tick on a record that
     * lost entries.
     */
    chain.entries = await build(honest)
    await runCheck(SOCIETY)

    chain.entries = (await build(honest)).slice(0, 1)
    const second = await runCheck(SOCIETY)
    expect(second.device).toEqual({ changed: honest.length })
    expect(verdict(second).tone).toBe('break')
  })

  it('does not match an absent hash against an absent recorded hash', async () => {
    /*
     * The case the explicit typeof guard is for. asMemory refuses an empty
     * recorded hash, so the pair can only both be absent if that guard is
     * dropped - at which point a chain that lost the entry reads as
     * 'consistent'. Asserted through the parser AND the check, because
     * either one alone leaves the other free to regress.
     */
    expect(asMemory({ ...good, hash: '' })).toBeNull()

    chain.entries = await build(honest)
    await runCheck(SOCIETY)
    const saved = JSON.parse(localStorage.getItem(memKey)!)
    // A sequence beyond the chain: hashes[seq - 1] is undefined.
    localStorage.setItem(memKey, JSON.stringify({ ...saved, seq: honest.length + 5 }))
    const second = await runCheck(SOCIETY)
    expect(second.device).toEqual({ changed: honest.length + 5 })
    expect(verdict(second).tone).toBe('break')
  })
})

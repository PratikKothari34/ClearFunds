/*
 * An entry whose kind this build has no layout for must degrade honestly.
 *
 * The backend ships a new kind with its contract; a resident on an older
 * build then holds a chain containing an entry it cannot encode. Before
 * this, walk() threw on that entry and the screen read "The record does not
 * hold together. Do not rely on these figures." - the product's loudest
 * alarm, on a correct ledger, for every resident who had not updated.
 *
 * These assert the rule, never a sample hash: that an uncheckable entry is
 * named and not accused, that a tampered KNOWN entry is still caught beside
 * it, and that the alarm still fires for real breakage.
 */
import { ChainError, UnknownKindError, hex, preimage, sha256, walk, type Entry } from './chain'
import { verdict, type Check } from './verify'

const ZERO = '0'.repeat(64)

/** Build a valid chain of `kinds`, hashing each entry properly. */
async function chainOf(kinds: { kind: string; body: Record<string, unknown> }[]): Promise<Entry[]> {
  const out: Entry[] = []
  let prev = ZERO
  for (let i = 0; i < kinds.length; i++) {
    const e: Entry = {
      format_version: 1,
      society_id: 'soc_test',
      sequence: i + 1,
      prev_hash: prev,
      kind: kinds[i]!.kind,
      recorded_at: 1793520000000 + i,
      actor: null,
      body: kinds[i]!.body,
    }
    /*
     * An unknown kind cannot be hashed here either, which is the point: the
     * server would have hashed it, so stand in a well-formed hex digest of
     * the right length rather than a recomputed one.
     */
    try {
      prev = hex(await sha256(preimage(e)))
    } catch (err) {
      if (!(err instanceof UnknownKindError)) throw err
      prev = hex(await sha256(new TextEncoder().encode(`server-hash-${i}`)))
      e.entry_hash = prev
    }
    out.push(e)
  }
  return out
}

const known = { kind: 'proposal_closed', body: { proposal_seq: 1, outcome: 'approved' } }
const futureKind = { kind: 'kind_from_a_newer_backend', body: { whatever: 'the contract says' } }

describe('an entry this build cannot check', () => {
  it('does not stop the walk, and is reported by sequence', async () => {
    const entries = await chainOf([known, futureKind, known])
    const { hashes, unchecked } = await walk(entries)
    // Every entry still got a hash, so later links and the anchor still work.
    expect(hashes).toHaveLength(entries.length)
    expect(unchecked).toEqual([2])
  })

  it('still recomputes every entry whose kind IS known', async () => {
    /*
     * The concession is confined to the unknown entry. Tamper with a known
     * one after it and the link check must still fail - otherwise an unknown
     * kind would become a place to hide a change.
     */
    const entries = await chainOf([known, futureKind, known])
    entries[2]!.body = { proposal_seq: 1, outcome: 'rejected' }
    const tampered = await chainOf([known, futureKind, known])
    tampered[2]!.body = { proposal_seq: 1, outcome: 'rejected' }
    const { hashes } = await walk(tampered)
    const honest = await walk(await chainOf([known, futureKind, known]))
    expect(hashes[2]).not.toBe(honest.hashes[2])
  })

  it('refuses an uncheckable entry with no usable fingerprint', async () => {
    const entries = await chainOf([known, futureKind, known])
    delete entries[1]!.entry_hash
    await expect(walk(entries)).rejects.toThrow(ChainError)
  })

  it('refuses a fingerprint that is not a 32-byte hex digest', async () => {
    const entries = await chainOf([known, futureKind, known])
    entries[1]!.entry_hash = 'deadbeef'
    await expect(walk(entries)).rejects.toThrow(/cannot be checked/)
  })

  it('is an UnknownKindError, which is not how tampering is reported', async () => {
    const e: Entry = {
      format_version: 1, society_id: 's', sequence: 7, prev_hash: ZERO,
      kind: 'not_a_kind', recorded_at: 1, actor: null, body: {},
    }
    expect(() => preimage(e)).toThrow(UnknownKindError)
    try {
      preimage(e)
    } catch (err) {
      // The message must name the entry and the version, not the record.
      expect((err as Error).message).toMatch(/entry 7/)
      expect((err as Error).message).toMatch(/cannot check/)
      expect((err as Error).message).not.toMatch(/tamper|broken|does not hold/i)
    }
  })
})

describe('what the resident is told', () => {
  const base: Check = {
    at: 0, entries: 3, head: { seq: 3, hash: 'a'.repeat(64) }, chain: 'ok',
    unchecked: [], signatures: { checked: 3, failed: [] }, device: 'consistent', anchor: 'matches',
  }

  it('never says the record is broken because of an unknown kind', () => {
    const v = verdict({ ...base, unchecked: [2] })
    expect(v.tone).not.toBe('break')
    expect(v.line).not.toMatch(/do not rely|does not hold together/i)
  })

  it('says what it could not check, rather than only that things matched', () => {
    const v = verdict({ ...base, unchecked: [2] })
    expect(v.line).toMatch(/cannot check/)
    // The reassuring line must not stand alone while something was unchecked.
    expect(v.line).not.toBe(verdict(base).line)
  })

  it('discloses the count when several entries could not be checked', () => {
    const v = verdict({ ...base, unchecked: [2, 5, 9] })
    expect(v.line).toMatch(/3 entries/)
  })

  it('still breaks for a chain that genuinely failed', () => {
    const v = verdict({ ...base, chain: { failed: 'entry 2 does not link to entry 1' } })
    expect(v.tone).toBe('break')
  })

  it('still breaks for a changed entry even when something was unchecked', () => {
    /*
     * Real evidence of a change outranks the disclosure. Ordering the other
     * way would let one unknown kind downgrade a genuine alarm to a notice.
     */
    const v = verdict({ ...base, unchecked: [2], device: { changed: 3 } })
    expect(v.tone).toBe('break')
  })

  it('still breaks on a signature that does not match its key', () => {
    const v = verdict({ ...base, unchecked: [2], signatures: { checked: 3, failed: [2] } })
    expect(v.tone).toBe('break')
  })
})

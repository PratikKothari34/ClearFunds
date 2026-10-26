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

  it('still rejects a tampered KNOWN entry sitting after an unknown one', async () => {
    /*
     * The concession is confined to the unknown entry. Change the body of a
     * KNOWN entry and the chain must fail outright - not merely hash
     * differently - or an unknown kind becomes cover for editing its
     * neighbours. Entry 4 is what links to the tampered entry 3.
     */
    const entries = await chainOf([known, futureKind, known, known])
    entries[2]!.body = { proposal_seq: 1, outcome: 'rejected' }
    await expect(walk(entries)).rejects.toThrow(/does not link/)
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

/** Everything checkable held; vary one field per test. */
const base: Check = {
  at: 0, entries: 3, head: { seq: 3, hash: 'a'.repeat(64) }, chain: 'ok',
  unchecked: [], regressed: [], signatures: { checked: 3, failed: [] },
  device: 'consistent', anchor: 'matches',
}

describe('what the resident is told', () => {

  it('never says the record is broken because of an unknown kind', () => {
    const v = verdict({ ...base, unchecked: [2] })
    expect(v.tone).not.toBe('break')
    expect(v.line).not.toMatch(/do not rely|does not hold together/i)
  })

  it('says what it could not check, rather than only that things matched', () => {
    const v = verdict({ ...base, unchecked: [2] })
    expect(v.line).toMatch(/not checked/)
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

/*
 * The forgery this guards against, and the reason an unreadable entry cannot
 * simply be excused.
 *
 * The server decides what `kind` says. So it can take an entry a phone has
 * already verified, relabel it to something this build does not know, change
 * the body, and report the entry's ORIGINAL hash. Every later hash still
 * matches, so the head, the anchor and the device memory all agree - and if
 * the entry was an approval or a sign-off it also drops out of
 * checkSignatures, which filters by kind. Nothing but the record of what this
 * phone had already recomputed can tell that apart from an honest new kind.
 */
describe('an entry that was checked here before', () => {
  it('breaks, and is not excused as an unrecognised kind', () => {
    const v = verdict({ ...base, unchecked: [2], regressed: [2] })
    expect(v.tone).toBe('break')
    expect(v.line).toMatch(/checked on this phone before/)
    expect(v.line).not.toMatch(/does not recognise/)
  })

  it('outranks the unrecognised-kind notice when both are present', () => {
    // Entry 2 is a relabel; entry 9 is honestly new. The relabel decides.
    const v = verdict({ ...base, unchecked: [2, 9], regressed: [2] })
    expect(v.tone).toBe('break')
  })

  it('does not fire for a new kind above what this phone had checked', () => {
    const v = verdict({ ...base, unchecked: [9], regressed: [] })
    expect(v.tone).toBe('warn')
  })
})

describe('the wording for an unrecognised kind', () => {
  const base2: Check = { ...base, unchecked: [2] }

  it('does not claim the kind is newer, which this build cannot know', () => {
    /*
     * "a newer kind" asserts the entry came from a later backend. All this
     * build knows is that it has no layout for it - a relabel looks the same.
     */
    expect(verdict(base2).line).not.toMatch(/newer/i)
  })

  it('says the contents were not checked, rather than implying they are fine', () => {
    const line = verdict(base2).line
    expect(line).toMatch(/not checked/)
    expect(line).not.toMatch(/everything else held/i)
  })
})

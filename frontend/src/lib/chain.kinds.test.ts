/*
 * THE THREE KIND VECTOR FILES THAT NOTHING CONSUMED.
 *
 * chain.test.ts drives entry-preimage.v1.json. The other three files in
 * contracts/chain/vectors/ - society, claims and notices - shipped with the
 * contracts and were read by nothing, so:
 *
 *   - seven kinds had NO layout in KINDS at all (payment_claim, claim_closed,
 *     notice, vote_opened, ballot, vote_closed, proposal_ref). walk() skips a
 *     kind it has no layout for and continues on the entry_hash the SERVER
 *     reported, which is the one thing the product claims not to do. Seven
 *     kinds' worth of a real chain were being trusted rather than recomputed.
 *   - document_attached and tasks_set HAD layouts, written by hand against
 *     the prose, with no vector ever run against them.
 *
 * Both halves are asserted, because they fail differently. The layout table
 * is compared field by field against the vectors' own `layouts`, so a field
 * reordered, renamed, or given the wrong type fails HERE with the field
 * named - a hash mismatch alone says only "somewhere in this entry". Then
 * every entry is recomputed to its preimage and hash, which is what proves
 * the layout is actually the one the backend encoded with.
 *
 * Everything is enumerated from the files. Nothing in this suite names a
 * kind, a field, a count or a hash, so a kind added to a vector file is
 * covered the moment it lands, and a vector file whose name changes fails
 * rather than silently measuring nothing.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KINDS, encode, flatToken, hex, preimage, sha256, walk, type Entry } from './chain'

const FILES = ['society-kinds', 'claims-kinds', 'notices-kinds'] as const

type Vectors = {
  spec: string
  layouts: Record<string, [string, string][]>
  entries: { name: string; entry: Entry; preimage_hex: string; entry_hash: string }[]
  must_differ: { name: string; a: string; b: string }[]
  flat_token?: { society_salt: string; vote_seq: number; flat_id: string; token: string }[]
}

const load = (name: string): Vectors =>
  JSON.parse(readFileSync(resolve(__dirname, `../../../contracts/chain/vectors/${name}.v1.json`), 'utf8'))

const all = FILES.map((f) => [f, load(f)] as const)

describe.each(all)('contracts/chain/vectors/%s.v1.json', (_file, v) => {
  it('is a vector file with layouts and entries, so the rest is not vacuous', () => {
    // A renamed key or a restructured file would otherwise make every
    // assertion below iterate an empty list and pass.
    expect(Object.keys(v.layouts).length).toBeGreaterThan(0)
    expect(v.entries.length).toBeGreaterThan(0)
    expect(v.must_differ.length).toBeGreaterThan(0)
  })

  for (const [kind, layout] of Object.entries(v.layouts)) {
    it(`KINDS.${kind} matches the contract layout field for field`, () => {
      const ours = KINDS[kind]
      expect(ours, `no layout for '${kind}'; walk() would trust the server hash for it`).toBeDefined()
      // Compared as pairs, not as a serialised blob, so the failure names the
      // field. Order is part of the layout: the preimage concatenates in it.
      expect(ours).toEqual(layout)
    })
  }

  for (const e of v.entries) {
    it(`recomputes ${e.entry.kind}: ${e.name}`, async () => {
      const pre = preimage(e.entry)
      expect(hex(pre)).toBe(e.preimage_hex)
      expect(hex(await sha256(pre))).toBe(e.entry_hash)
    })
  }

  it('walks the whole file as one chain, with nothing left unchecked', async () => {
    /*
     * Walking the entries together proves the layouts as a set rather than
     * one at a time - and proves `unchecked` is EMPTY, which is the point of
     * this suite. A missing layout does not throw: walk() moves the entry
     * into `unchecked` and takes the server's word for its hash, so an
     * assertion on the hashes alone would still pass with a layout deleted.
     *
     * Each file starts mid-chain (sequence 2, 41, 100) and its first
     * prev_hash stands in for an entry the file does not carry, so the
     * entries are renumbered from 1 and re-linked by this device's own
     * recomputed hashes. That is the only way walk() will accept them; it
     * does not weaken the check, because every hash compared below is one
     * this encoder produced from the file's real body.
     */
    const hashes: string[] = []
    let prev = '0'.repeat(64)
    const chain: Entry[] = []
    for (let i = 0; i < v.entries.length; i++) {
      const e = { ...structuredClone(v.entries[i]!.entry), sequence: i + 1, prev_hash: prev }
      chain.push(e)
      prev = hex(await sha256(preimage(e)))
      hashes.push(prev)
    }
    const got = await walk(chain)
    expect(got.unchecked, 'an entry was not recomputed: a layout is missing').toEqual([])
    expect(got.hashes).toEqual(hashes)
  })

  it('the must_differ pairs are two distinct hashes', () => {
    // Guards the file itself: a corrupt or truncated pair would make the
    // derived cases below compare a value against itself.
    for (const m of v.must_differ) {
      expect(m.a, m.name).not.toBe(m.b)
      expect(m.a).toMatch(/^[0-9a-f]{64}$/)
      expect(m.b).toMatch(/^[0-9a-f]{64}$/)
    }
  })
})

/*
 * THE must_differ CASES, DERIVED RATHER THAN READ.
 *
 * Each case names a body change that must change the hash. Asserting that the
 * two published hashes differ proves nothing about this encoder - the test
 * above does that only to catch a corrupt file. These reconstruct side `b` by
 * making the change to the real entry and recomputing, so the ENCODER is what
 * is under test. Every one is a shape where a plausible encoder produces the
 * same bytes for two different facts.
 *
 * Each case finds its entry by content, never by index.
 */
const byKind = (v: Vectors, kind: string) => v.entries.filter((e) => e.entry.kind === kind)
const society = load('society-kinds')
const claims = load('claims-kinds')
const notices = load('notices-kinds')

const rehash = async (e: Entry, body: Record<string, unknown>) =>
  hex(await sha256(preimage({ ...structuredClone(e), body: { ...structuredClone(e.body), ...body } })))

/** Every ordering of a short list. Used to locate a reordered-list hash. */
function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs]
  const out: T[][] = []
  for (let i = 0; i < xs.length; i++) {
    const rest = [...xs.slice(0, i), ...xs.slice(i + 1)]
    for (const p of permutations(rest)) out.push([xs[i]!, ...p])
  }
  return out
}

/**
 * The same total votes, split level across the leading options: a genuine
 * tie, with no single winner. Derived from the published tallies rather than
 * written out, so the case is about the shape (tied, nothing carried) and not
 * about one array a vector regeneration could change.
 */
function tiedTallies(tallies: number[]): number[] {
  const total = tallies.reduce((a, b) => a + b, 0)
  expect(total, 'the published tallies are empty; no tie to build').toBeGreaterThan(1)
  const out = tallies.map(() => 0)
  for (let i = 0; i < total; i++) out[i % 2] = (out[i % 2] ?? 0) + 1
  // Levelled across the first two options, so there is no outright winner.
  expect(out[0]).toBe(out[1])
  expect(out.reduce((a, b) => a + b, 0)).toBe(total)
  return out
}

/** The must_differ case whose `a` is this entry's published hash. */
function caseFor(v: Vectors, entryHash: string) {
  const m = v.must_differ.find((x) => x.a === entryHash)
  expect(m, 'no must_differ case anchored to this entry any more').toBeDefined()
  return m!
}

describe('must_differ: a different fact never encodes to the same bytes', () => {
  it('tasks in a different order hash differently, so the server must sort', async () => {
    const e = byKind(society, 'tasks_set').find((x) => (x.entry.body.tasks as string[]).length > 1)!
    expect(e, 'no tasks_set entry with more than one task').toBeDefined()
    const tasks = e.entry.body.tasks as string[]
    const md = caseFor(society, e.entry_hash)
    expect(await rehash(e.entry, { tasks })).toBe(md.a)
    /*
     * Side `b` is one specific reordering of these tasks, and the file does
     * not say which. Rather than hardcode a permutation - which would be a
     * magic constant that a later vector regeneration silently invalidates -
     * search the orderings for the one that reproduces it. Finding exactly
     * one proves both halves: this encoder is order-sensitive, and it agrees
     * with the backend on which ordering gives which hash.
     */
    const hashes = await Promise.all(
      permutations(tasks).map((order) => rehash(e.entry, { tasks: order })),
    )
    expect(hashes.filter((x) => x === md.b), 'no reordering of the tasks gives side b').toHaveLength(1)
    // And every ordering is a different hash: none of them collide.
    expect(new Set(hashes).size, 'two orderings hashed alike: the encoder sorts').toBe(hashes.length)
  })

  it('a vacant holder (absent) differs from an empty-string holder', async () => {
    const e = byKind(society, 'tasks_set').find((x) => x.entry.body.holder === null)!
    expect(e, 'no vacant tasks_set entry').toBeDefined()
    const md = caseFor(society, e.entry_hash)
    expect(await rehash(e.entry, { holder: null })).toBe(md.a)
    /* Tag 0 with no payload, against tag 2 with a zero-length one. An encoder
     * that coerced absent to '' would give both the same bytes, and a post
     * nobody holds would be indistinguishable from one held by a nameless
     * person. */
    expect(await rehash(e.entry, { holder: '' })).toBe(md.b)
  })

  it('one paisa on a claim changes the hash', async () => {
    const e = byKind(claims, 'payment_claim')[0]!
    const md = caseFor(claims, e.entry_hash)
    // The altered amount is read out of the case name rather than written
    // here, so this cannot be "fixed" by editing an expected number.
    const altered = Number(/(\d+) vs/.exec(md.name)?.[1])
    expect(altered, 'the vector no longer names the altered amount').toBeGreaterThan(0)
    expect(altered).not.toBe(e.entry.body.amount_minor)
    expect(await rehash(e.entry, {})).toBe(md.a)
    expect(await rehash(e.entry, { amount_minor: altered })).toBe(md.b)
  })

  it('a receipted close naming a proposal differs from one with none', async () => {
    // `a` is the entry as published, which NAMES its proposal; `b` is the
    // same close with the field absent.
    const e = byKind(claims, 'claim_closed').find((x) => x.entry.body.proposal_seq != null)!
    expect(e, 'no claim_closed entry naming a proposal').toBeDefined()
    const md = caseFor(claims, e.entry_hash)
    expect(await rehash(e.entry, {})).toBe(md.a)
    expect(await rehash(e.entry, { proposal_seq: null })).toBe(md.b)
    /* The absent int must not encode as a zero: tag 0 with no payload, not
     * tag 1 with eight zero bytes. If it did, a receipt that posted no
     * proposal would carry the hash of one citing proposal 0. */
    expect(await rehash(e.entry, { proposal_seq: 0 })).not.toBe(md.b)
  })

  it('a tie is carried absent, never as option 0', async () => {
    /*
     * `a` is the published close, where option 1 won outright. `b` is the
     * same vote TIED: the tallies level and `carried` absent. Both sides are
     * reconstructed, so the case tests the encoder rather than reading two
     * hashes back out of the file.
     */
    const e = byKind(notices, 'vote_closed')[0]!
    const md = caseFor(notices, e.entry_hash)
    const tallies = e.entry.body.tallies as number[]
    expect(await rehash(e.entry, {})).toBe(md.a)

    const tied = tiedTallies(tallies)
    expect(await rehash(e.entry, { tallies: tied, carried: null })).toBe(md.b)

    /* The trap this case exists for: `carried: null` is a TIE - nothing
     * carried - while `carried: 0` is the FIRST option winning. Collapsing
     * absent to a zero would give a tied vote the hash of a decided one, on
     * the screen a committee reads the result from. */
    expect(await rehash(e.entry, { tallies: tied, carried: 0 })).not.toBe(md.b)
    // And a tie is not merely a different `carried` on the same tallies:
    // both fields are inside the hash.
    expect(await rehash(e.entry, { carried: null })).not.toBe(md.b)
  })

  it('the same flat token differs in every vote, so ballots cannot be linked', async () => {
    /* Recomputed from the published test salt, not read back: this is the
     * derivation notices.v1.md specifies, and the privacy property of an
     * anonymous vote rests entirely on vote_seq being inside the hash. */
    const d = notices.flat_token!
    expect(d, 'the vectors no longer carry the token derivations').toBeDefined()
    expect(d.length, 'fewer than two derivations to compare').toBeGreaterThan(1)
    const tokens = new Set<string>()
    for (const t of d) {
      expect(await flatToken(t.society_salt, t.vote_seq, t.flat_id)).toBe(t.token)
      tokens.add(t.token)
    }
    // Same flat, same salt, different votes: every token must be distinct.
    expect(new Set(d.map((t) => t.flat_id)).size, 'the derivations are not one flat').toBe(1)
    expect(new Set(d.map((t) => t.vote_seq)).size, 'the derivations are not two votes').toBe(d.length)
    expect(tokens.size, 'two votes produced one token: ballots are linkable').toBe(d.length)
    // And the ballots in the file carry exactly those tokens.
    const carried = byKind(notices, 'ballot').map((b) => b.entry.body.flat_token).filter((x) => x != null)
    for (const t of d) expect(carried).toContain(t.token)
  })

  it('a ballot never carries both a flat and a token, nor neither', () => {
    /* notices.v1.md: exactly one is present. Both would put the flat beside
     * its own anonymous token and unmask the ballot outright. A field layout
     * cannot express the constraint, so it is asserted over the vectors. */
    const ballots = byKind(notices, 'ballot')
    expect(ballots.length, 'no ballot entries to check').toBeGreaterThan(0)
    for (const b of ballots) {
      const named = b.entry.body.flat_id != null
      const anon = b.entry.body.flat_token != null
      expect(named !== anon, `${b.name} carries both or neither`).toBe(true)
    }
  })
})

describe('the types these kinds introduced', () => {
  it('encodes the list<bytes> that notice.attachments is the first use of', async () => {
    /* The generic list branch recurses, so list<bytes> needed no new encoder
     * code - which is exactly why it needs a case: nothing would have failed
     * if it were wrong. Asserted by locating the encoded field inside the
     * real preimage, so this tests the same bytes the hash is taken over. */
    const e = byKind(notices, 'notice')[0]!
    const attachments = e.entry.body.attachments as string[]
    expect(attachments.length, 'the notice vector carries no attachment').toBeGreaterThan(0)
    expect(hex(preimage(e.entry))).toContain(hex(encode('list<bytes>', attachments)))
  })

  it('an empty list and an absent field are not the same bytes', () => {
    /* A notice with no attachments encodes tag 5 with a zero-length payload;
     * an absent optional encodes tag 0. An encoder collapsing the two would
     * hash "no attachments" and "field not present" alike. */
    expect(hex(encode('list<bytes>', []))).not.toBe(hex(encode('bytes?', null)))
    expect(hex(encode('list<int>', []))).not.toBe(hex(encode('int?', null)))
  })
})

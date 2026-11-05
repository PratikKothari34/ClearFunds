/*
 * THE CACHED CHECK, WHICH IS READ DURING RENDER.
 *
 * `Provenance` sits on the dashboard - the first screen a resident sees - and
 * calls verdict() on whatever lastCheck() returned, while rendering. verdict()
 * dereferences c.regressed, c.signatures.failed and c.device without guarding
 * them, and this renders on the dashboard above the route boundary, so a
 * shape it cannot read costs the whole app rather than one card.
 *
 * Not hypothetical: `regressed` was ADDED to Check, so every device holding a
 * cache written before that has `regressed: undefined`. Shipping a field
 * addition would have blanked the dashboard for existing users.
 *
 * The first describe is what keeps the guard honest. A validator this strict is
 * only safe if what runCheck actually writes still passes it - otherwise every
 * honest cache is silently thrown away, the dashboard re-checks on every load,
 * and that looks exactly like nothing being wrong.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { preimage, sha256, hex, type Entry } from './chain'

const chain = vi.hoisted(() => ({ entries: [] as Entry[] }))
vi.mock('./api', () => ({ fetchChain: async () => chain.entries }))

const { asCheck, lastCheck, runCheck, verdict } = await import('./verify')

const ZERO = '0'.repeat(64)
const SOCIETY = 'test-society'
const checkKey = `cf-check:${SOCIETY}`

const posting = (n: number, minor: number) => ({
  kind: 'posting',
  body: {
    proposal_seq: n, effect: 'debit', amount_minor: minor, currency: 'INR',
    limit_minor: null, person: null, role: null, derived: null,
  },
})

async function build(specs: { kind: string; body: Record<string, unknown> }[]): Promise<Entry[]> {
  const out: Entry[] = []
  let prev = ZERO
  for (const [i, s] of specs.entries()) {
    const e: Entry = {
      format_version: 1, society_id: SOCIETY, sequence: i + 1, prev_hash: prev,
      kind: s.kind, recorded_at: 1700000000000 + i, actor: null, body: s.body,
    }
    prev = hex(await sha256(preimage(e)))
    out.push(e)
  }
  return out
}

const honest = [posting(1, 500000), posting(2, 900000), posting(3, 250000)]

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.stubEnv('VITE_ANCHOR_URL', '')
})

describe('what runCheck writes is what asCheck accepts', () => {
  it('survives the JSON round-trip the cache actually performs', async () => {
    /*
     * The guard against over-tightening. If this fails, the validator is
     * discarding honest caches, and the only symptom is a re-check on every
     * page load - indistinguishable from working correctly.
     */
    chain.entries = await build(honest)
    const fresh = await runCheck(SOCIETY)
    const cached = lastCheck(SOCIETY)
    expect(cached).not.toBeNull()
    expect(cached).toEqual(JSON.parse(JSON.stringify(fresh)))
  })

  it('round-trips a check that found tampering, not only a clean one', async () => {
    /* The break states carry the shapes most likely to be refused by accident:
     * chain as an object, device as an object, a populated regressed list.
     * Those are exactly the ones a resident must still be shown. */
    chain.entries = await build(honest)
    await runCheck(SOCIETY)
    chain.entries = (await build(honest)).slice(0, 1)
    const second = await runCheck(SOCIETY)
    expect(verdict(second).tone).toBe('break')
    expect(lastCheck(SOCIETY)).toEqual(JSON.parse(JSON.stringify(second)))
  })

  it('round-trips a check whose chain failed to recompute', async () => {
    const broken = await build(honest)
    broken[1] = { ...broken[1]!, prev_hash: 'f'.repeat(64) }
    chain.entries = broken
    const c = await runCheck(SOCIETY)
    expect(c.chain).not.toBe('ok')
    expect(lastCheck(SOCIETY)).toEqual(JSON.parse(JSON.stringify(c)))
  })
})

describe('a cached check that cannot be rendered', () => {
  /** A cache in the shape runCheck writes, for field-by-field damage. */
  const good = {
    at: 1700000000000, entries: 3, head: { seq: 3, hash: 'a'.repeat(64) }, chain: 'ok',
    unchecked: [], regressed: [], signatures: { checked: 3, failed: [] },
    device: 'consistent', anchor: 'matches',
  }

  it('accepts the shape it is modelled on', () => {
    expect(asCheck(good)).not.toBeNull()
  })

  it('refuses a check missing a field verdict() dereferences', () => {
    /* The shipped-field-addition case. `regressed` arrived after devices had
     * already cached a Check, and `c.regressed.length` is a TypeError on the
     * old shape - during render, with no boundary. */
    for (const field of ['regressed', 'unchecked', 'signatures', 'device', 'chain', 'anchor', 'at']) {
      const { [field]: _gone, ...without } = good as Record<string, unknown>
      expect(asCheck(without), `accepted a cache with no \`${field}\``).toBeNull()
    }
  })

  it('refuses a null device, which passes a typeof object check', () => {
    // typeof null === 'object', so verdict() enters the branch and reads
    // .changed off null.
    expect(asCheck({ ...good, device: null })).toBeNull()
    expect(asCheck({ ...good, device: {} })).toBeNull()
    expect(asCheck({ ...good, device: { changed: 'two' } })).toBeNull()
    expect(asCheck({ ...good, device: 'cf_a_state_from_the_future' })).toBeNull()
  })

  it('accepts every device state this build defines', () => {
    for (const d of ['first', 'consistent', { changed: 2 }]) {
      expect(asCheck({ ...good, device: d }), `refused ${JSON.stringify(d)}`).not.toBeNull()
    }
  })

  it('refuses sequence lists that are not sequences', () => {
    for (const bad of [['2'], [null], [1.5], [Number.NaN], 'two', {}, 7]) {
      expect(asCheck({ ...good, regressed: bad }), `accepted regressed ${JSON.stringify(bad)}`).toBeNull()
      expect(asCheck({ ...good, unchecked: bad }), `accepted unchecked ${JSON.stringify(bad)}`).toBeNull()
    }
  })

  it('refuses a signatures block verdict() would throw on', () => {
    const bads = [null, 'ok', {}, { checked: 3 }, { failed: [] }, { checked: '3', failed: [] }, { checked: 3, failed: 'none' }]
    for (const bad of bads) {
      expect(asCheck({ ...good, signatures: bad }), `accepted ${JSON.stringify(bad)}`).toBeNull()
    }
  })

  it('accepts every anchor state this build defines, and refuses others', () => {
    for (const a of ['unpublished', 'unreachable', 'matches', 'behind']) {
      expect(asCheck({ ...good, anchor: a }), `refused ${a}`).not.toBeNull()
    }
    const head = { hash: 'b'.repeat(64), highest_sequence: 3, entry_count: 3, as_of: 0, format_version: 1 }
    expect(asCheck({ ...good, anchor: { mismatch: head } })).not.toBeNull()
    const bads = [{}, { mismatch: null }, { mismatch: { hash: '', highest_sequence: 3 } }, { mismatch: { hash: 'b', highest_sequence: 1.5 } }, 'cf_elsewhere', null]
    for (const bad of bads) {
      expect(asCheck({ ...good, anchor: bad }), `accepted ${JSON.stringify(bad)}`).toBeNull()
    }
  })

  it('refuses a chain state verdict() cannot describe', () => {
    expect(asCheck({ ...good, chain: { failed: 'the record could not be read' } })).not.toBeNull()
    for (const bad of [{}, { failed: 7 }, null, 'broken', 'OK']) {
      expect(asCheck({ ...good, chain: bad }), `accepted ${JSON.stringify(bad)}`).toBeNull()
    }
  })

  it('refuses anything that is not an object, including an array carrying the fields', () => {
    for (const v of [7, 'x', [], null, undefined, true, Object.assign([], good)]) {
      expect(asCheck(v)).toBeNull()
    }
  })

  it('reads as not-yet-checked rather than throwing, end to end', () => {
    /* What the dashboard does with it. null already renders as absent, never
     * as a pass, so the degradation path existed - nothing was reaching it. */
    const raws = ['7', '[]', 'null', '{"at":0}', JSON.stringify({ ...good, regressed: undefined }), 'not json at all']
    for (const raw of raws) {
      localStorage.setItem(checkKey, raw)
      const c = lastCheck(SOCIETY)
      expect(c, `accepted ${raw}`).toBeNull()
      expect(() => (c ? verdict(c) : null)).not.toThrow()
    }
  })
})

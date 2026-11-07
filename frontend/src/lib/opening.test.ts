/*
 * HOW THE SOCIETY WAS OPENED - society.v1.md's sequence 1 and 2 rule.
 *
 * The thing worth stating about this suite: a wrongly-opened chain is
 * INTERNALLY PERFECT. Every hash recomputes, every link resolves, the head
 * matches the anchor. So these tests build real, correctly-linked chains and
 * assert that the check still reports them - if the fixtures were allowed to
 * be malformed, the suite would be proving that walk() catches broken
 * hashes, which it already does, instead of proving this rule exists.
 *
 * They drive runCheck, not opening() alone, for the reason the regression
 * suite records: a test that calls the presenter with a hand-built input
 * proves what the screen says once the answer is known, and cannot prove how
 * the answer was computed. opening() is called directly only where the input
 * cannot be reached through a chain (a body field that is not a string).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { preimage, sha256, hex, type Entry } from './chain'
import { opening, openingLine } from './opening'

const chain = vi.hoisted(() => ({ entries: [] as Entry[] }))
vi.mock('./api', () => ({ fetchChain: async () => chain.entries }))

const { runCheck, verdict, asCheck } = await import('./verify')

const ZERO = '0'.repeat(64)
const SOCIETY = 'test-society'

type Spec = { kind: string; body: Record<string, unknown> }

/*
 * Bodies carry EVERY field their layout in KINDS declares, because preimage()
 * refuses a required field that is absent. That refusal is load-bearing here:
 * it is what stops this suite from building a chain no server could produce
 * and then proving something about it. A fixture of a shape no chain emits is
 * how `limitEntries` stayed broken under 600 passing tests.
 */
const opened: Spec = {
  kind: 'society_opened',
  body: { name: 'Green Meadows', currency: 'INR', fy_start_month: 4, approval_limit_minor: 0,
    committee: ['per_1', 'per_2'], roles: ['treasurer', 'secretary'] },
}
const minutes: Spec = {
  kind: 'document_attached',
  body: { purpose: 'election_minutes', file_name: 'agm-minutes.pdf', media_type: 'application/pdf',
    size_bytes: 482113, sha256: 'd7'.repeat(32) },
}
const tasks: Spec = {
  kind: 'tasks_set',
  body: { post_id: 'pst_a1b2c3d4', post_title: 'Treasurer', seat_role: 'treasurer',
    holder: 'per_1', tasks: ['collect maintenance'] },
}

/** A correctly linked chain. Every hash recomputes; only the CONTENTS vary. */
async function build(specs: Spec[]): Promise<Entry[]> {
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

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.stubEnv('VITE_ANCHOR_URL', '')
})

describe('a chain opened as the contract requires', () => {
  it('reports ok, and says so through the real check', async () => {
    chain.entries = await build([opened, minutes, tasks])
    const c = await runCheck(SOCIETY)
    expect(c.chain, 'the fixture must be internally sound').toBe('ok')
    expect(c.opening).toBe('ok')
    expect(openingLine('ok'), 'nothing to say when it is right').toBeNull()
  })
})

describe('a chain that was not opened under the contract', () => {
  /*
   * THE CASE THE ISSUE WAS FILED FOR. No election minutes anywhere: the
   * society opens and goes straight to business. Before this rule, this
   * verified clean.
   */
  it('is reported when sequence 2 is some other kind, though every hash is correct', async () => {
    chain.entries = await build([opened, tasks, tasks])
    const c = await runCheck(SOCIETY)

    // The point of the whole suite: nothing else is wrong with this chain.
    expect(c.chain, 'hashes all recompute').toBe('ok')
    expect(c.regressed, 'not tampering').toEqual([])
    expect(c.signatures.failed, 'no bad signatures').toEqual([])

    expect(c.opening).toEqual({ wrong: 'kind', found: 'tasks_set' })
    const v = verdict(c)
    expect(v.tone, 'not evidence of tampering, so never break').toBe('warn')
    expect(v.line, 'and it must name the minutes, not a kind name alone').toMatch(/election minutes/)
  })

  it('distinguishes a document of the wrong purpose from a wholly wrong kind', async () => {
    /*
     * A `document_attached` that is some other paperwork is a different
     * mistake from no document at all, and a resident deserves the
     * difference - one society attached the wrong file, the other never held
     * an election on record.
     */
    const wrong: Spec = { kind: 'document_attached', body: { ...minutes.body, purpose: 'insurance_policy' } }
    chain.entries = await build([opened, wrong, tasks])
    const c = await runCheck(SOCIETY)
    expect(c.opening).toEqual({ wrong: 'purpose', found: 'insurance_policy' })
    expect(verdict(c).line).toMatch(/not the election minutes/)
  })

  it('is reported when sequence 1 is not the society opening', async () => {
    // The same paragraph of the contract fixes sequence 1. Reporting only on
    // sequence 2 would pass a chain that fails one line higher up.
    chain.entries = await build([tasks, minutes, tasks])
    const c = await runCheck(SOCIETY)
    expect(c.opening).toEqual({ wrong: 'first', found: 'tasks_set' })
    expect(verdict(c).tone).toBe('warn')
  })
})

describe('a chain too short to judge', () => {
  /*
   * 'short' is its own state, not folded into ok and not folded into wrong.
   * A one-entry chain is not a society opened badly - it is one this device
   * cannot judge, and the two must not share an answer. The same partition
   * mistake as `null <= 0` for money.
   */
  it('says it cannot tell, rather than passing or condemning', async () => {
    for (const specs of [[opened], []]) {
      /*
       * A CLEAN DEVICE PER CASE, deliberately. Reusing one would hand the
       * empty chain a memory recorded from the one-entry chain, and a chain
       * that has lost an entry this phone already saw is reported as a
       * change - correctly. That is a different finding, and letting it fire
       * here would mean this test passed or failed for a reason that has
       * nothing to do with the opening.
       */
      localStorage.clear()
      chain.entries = await build(specs)
      const c = await runCheck(SOCIETY)
      expect(c.opening, `chain of ${specs.length}`).toBe('short')
      expect(verdict(c).tone, `chain of ${specs.length}`).toBe('warn')
      expect(verdict(c).line).toMatch(/too short/)
    }
  })
})

describe('reading the opening from sequence numbers, not array order', () => {
  it('cannot be passed by serving the minutes in the second array slot', async () => {
    /*
     * A server chooses the order it serves. If this read entries[1], a chain
     * whose SEQUENCE 2 is wrong could pass by putting the minutes second in
     * the array - the hash covers the sequence number, so that is what gets
     * read.
     */
    const built = await build([opened, tasks, minutes])
    chain.entries = [built[0]!, built[2]!, built[1]!] // minutes second in the array, sequence 3
    const c = await runCheck(SOCIETY)
    expect(c.opening, 'array order must not satisfy a sequence rule').toEqual({ wrong: 'kind', found: 'tasks_set' })
  })
})

describe('a purpose that is not a string', () => {
  /*
   * Body fields are server data and may be any JSON value. Called directly
   * because a chain cannot carry "the field is an object" and a string at
   * once, and because String({}) would compare as "[object Object]" and
   * report that to a resident.
   */
  it('is reported as not recorded rather than coerced', () => {
    const entry = (body: Record<string, unknown>): Entry => ({
      format_version: 1, society_id: SOCIETY, sequence: 2, prev_hash: ZERO,
      kind: 'document_attached', recorded_at: 1, actor: null, body })
    const first: Entry = { ...entry(opened.body), sequence: 1, kind: 'society_opened' }
    for (const bad of [{}, { purpose: {} }, { purpose: 7 }, { purpose: null }, { purpose: ['election_minutes'] }]) {
      const o = opening([first, entry(bad)])
      expect(o, JSON.stringify(bad)).toEqual({ wrong: 'purpose', found: '(not recorded)' })
      expect(openingLine(o), 'and the line must not print [object Object]').not.toMatch(/\[object/)
    }
  })
})

describe('the finding does not displace real evidence', () => {
  it('reports tampering ahead of a wrong opening when both are true', async () => {
    /*
     * A chain can be both wrongly opened and broken. The ordering in
     * verdict() must put the evidence first: "this record does not hold
     * together" outranks "the minutes are missing", because one of them
     * means the figures cannot be trusted at all.
     */
    const built = await build([opened, tasks, tasks])
    built[2]!.prev_hash = 'f'.repeat(64) // break the link
    chain.entries = built
    const c = await runCheck(SOCIETY)
    expect(c.opening, 'the opening is still read and still wrong').toEqual({ wrong: 'kind', found: 'tasks_set' })
    expect(verdict(c).tone, 'but the broken chain is what the resident is told').toBe('break')
    expect(verdict(c).line).toMatch(/does not hold together/)
  })

  it('does not let a matching fingerprint be the last word on a wrong opening', async () => {
    /*
     * The inverse, and the reason this sits ABOVE the reassurances. The
     * anchor genuinely matches - the published head is correct for this
     * chain. Saying only "Matches the published fingerprint" would be a true
     * sentence that answers a question nobody asked.
     */
    chain.entries = await build([opened, tasks, tasks])
    const c = await runCheck(SOCIETY)
    const withAnchor = { ...c, anchor: 'matches' as const }
    const v = verdict(withAnchor)
    expect(v.tone, 'a matching fingerprint must not make this ok').toBe('warn')
    expect(v.line).toMatch(/election minutes/)
  })
})

describe('a Check cached before this field existed', () => {
  /*
   * THE FIELD-ADDITION HAZARD, which has already cost this file once:
   * `regressed` was added to Check and every cached copy shipped it as
   * undefined, so `c.regressed.length` was a TypeError on the dashboard -
   * the first screen a resident sees, with no error boundary below it.
   */
  it('still parses, so upgrading does not discard the stored evidence', async () => {
    chain.entries = await build([opened, minutes, tasks])
    const fresh = await runCheck(SOCIETY)
    const { opening: _dropped, ...old } = fresh
    const parsed = asCheck(JSON.parse(JSON.stringify(old)))
    expect(parsed, 'an old cache must survive the upgrade').not.toBeNull()
    expect(parsed!.opening).toBeUndefined()
  })

  it('makes no claim about the opening rather than inventing one', async () => {
    chain.entries = await build([opened, minutes, tasks])
    const fresh = await runCheck(SOCIETY)
    const { opening: _dropped, ...old } = fresh
    const v = verdict(old as typeof fresh)
    expect(v.line, 'absent is not a finding').not.toMatch(/election minutes|too short/)
    expect(() => verdict(old as typeof fresh), 'and absent must not throw').not.toThrow()
  })

  it('refuses a present but malformed opening, because verdict reads its fields', async () => {
    chain.entries = await build([opened, minutes, tasks])
    const fresh = await runCheck(SOCIETY)
    for (const bad of [{ wrong: 'elsewhere', found: 'x' }, { wrong: 'kind' }, { found: 'x' }, {}, [], null, 'yes', 7]) {
      const parsed = asCheck(JSON.parse(JSON.stringify({ ...fresh, opening: bad })))
      expect(parsed, JSON.stringify(bad)).toBeNull()
    }
  })
})

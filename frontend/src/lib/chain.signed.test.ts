/*
 * THE SIGNED MESSAGE HAD NO VECTOR AND NO GUARD.
 *
 * `chain.kinds.test.ts` recomputes every ENTRY HASH against the vector files
 * in contracts/chain/vectors/, so the entry preimage is pinned field by
 * field. The SIGNED MESSAGE - a different preimage, built by
 * `signedMessage()` for the three kinds that carry a signature - had no
 * vector file and no assertion anywhere in the tree. Measured: nothing in
 * src/ so much as named `signedMessage`.
 *
 * What that let through, proven by mutation before this file existed:
 * replacing the `month_signoff` domain separator with the `approval` one
 * left ALL 1163 tests green. The two preimages then share a prefix, which is
 * exactly what a domain separator exists to prevent - a signature gathered
 * for one action becoming replayable as the other. The entry-hash separator
 * (`clearfunds/chain-entry`) is NOT in this gap: altering it dies instantly
 * against the vectors.
 *
 * Why this suite reads the CONTRACT rather than naming the strings: a test
 * that hardcodes `'clearfunds/month-signoff'` agrees with the code by
 * construction and says nothing about whether either matches the contract.
 * The enum-grew defect in this project had that exact shape - a check
 * hardcoding what it should have read from the contract drifted silently
 * when the contract moved. So the separators are parsed out of
 * `contracts/chain/kinds/ledger.v1.md`, and a separator renamed on either
 * side fails here.
 *
 * It asserts THREE things, because they fail differently:
 *   1. Every signed kind the contract names has a distinct separator, and
 *      the set in the code equals the set in the contract.
 *   2. Each kind's message actually BEGINS with its own separator, encoded
 *      the way `encode('text', ...)` encodes it - so a swap is caught even
 *      when both strings are legitimate contract values.
 *   3. No two kinds produce the same message prefix, which is the property
 *      the separator exists for and the one the mutation broke.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encode, signedMessage, type Entry } from './chain'

const CONTRACT = resolve(__dirname, '../../../contracts/chain/kinds/ledger.v1.md')

/*
 * Pull the signed-message table out of the contract. Each row looks like:
 *   | `month_signoff` | `text "clearfunds/month-signoff"` · ... |
 * The kind is the first cell; the separator is the quoted string in the
 * first `text "..."` of the second cell. Anything that stops matching is a
 * contract change this suite must be re-read against, so an empty parse
 * FAILS rather than vacuously passing.
 */
function contractSeparators(): Map<string, string> {
  const md = readFileSync(CONTRACT, 'utf8')
  const out = new Map<string, string>()
  const row = /^\|\s*`([a-z_]+)`\s*\|\s*`text "(clearfunds\/[a-z-]+)"/gm
  for (const m of md.matchAll(row)) out.set(m[1]!, m[2]!)
  return out
}

/** The minimum body each signed kind's message reads, per the contract row. */
const HASH = 'ab'.repeat(32)
const BODIES: Record<string, Record<string, unknown>> = {
  approval: { proposal_seq: 7, proposal_hash: HASH, decision: 'approve' },
  month_signoff: { month: '2026-10', through_seq: 41, through_hash: HASH },
  year_close: {
    fy: '2026-27',
    opinion: 'clean',
    statement: 'The accounts present a true and fair view.',
    through_seq: 93,
    through_hash: HASH,
  },
}

function entry(kind: string): Entry {
  return {
    format_version: 1,
    society_id: 'soc-1',
    sequence: 100,
    prev_hash: HASH,
    kind,
    recorded_at: 1_760_000_000,
    actor: 'person-1',
    body: BODIES[kind]!,
  } as Entry
}

const starts = (hay: Uint8Array, needle: Uint8Array) =>
  needle.length <= hay.length && needle.every((b, i) => hay[i] === b)

describe('the signed message carries its own domain separator', () => {
  const fromContract = contractSeparators()

  it('finds the signed-message rows in the contract at all', () => {
    // Guards the parse itself: a contract reformat must fail here, loudly,
    // rather than leave every assertion below iterating an empty map.
    expect(fromContract.size).toBeGreaterThanOrEqual(3)
  })

  it('gives every signed kind a separator the contract agrees with', () => {
    expect([...fromContract.keys()].sort()).toEqual(Object.keys(BODIES).sort())
  })

  it('gives each signed kind a DISTINCT separator', () => {
    const values = [...fromContract.values()]
    expect(new Set(values).size).toBe(values.length)
  })

  for (const [kind, sep] of contractSeparators()) {
    it(`begins ${kind}'s message with the separator the contract states`, async () => {
      const msg = await signedMessage(entry(kind))
      expect(msg).not.toBeNull()
      expect(starts(msg!, encode('text', sep))).toBe(true)
    })
  }

  it('never lets two signed kinds share a message prefix', async () => {
    // The property the separator exists for. This is the assertion that the
    // collapsed-separator mutant broke while every other suite stayed green.
    const msgs = new Map<string, Uint8Array>()
    for (const kind of fromContract.keys()) {
      const m = await signedMessage(entry(kind))
      expect(m).not.toBeNull()
      msgs.set(kind, m!)
    }
    for (const [a, ma] of msgs) {
      for (const [b, mb] of msgs) {
        if (a === b) continue
        expect(starts(ma, mb), `${b}'s message is a prefix of ${a}'s`).toBe(false)
      }
    }
  })

  it('does not sign a kind the contract lists no message for', async () => {
    // An unsigned kind must yield null, not a message built from a default
    // separator - that would make a signature checkable over the wrong text.
    expect(await signedMessage(entry('expense'))).toBeNull()
  })
})

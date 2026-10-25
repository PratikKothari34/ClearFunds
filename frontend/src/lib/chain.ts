// An independent implementation of contracts/chain/entry-preimage.v1.md.
// It shares no code with the backend's SQL encoder; both must reproduce the
// contract's test vectors byte for byte (chain.test.ts).
//
// The verifier never normalises text and never trusts an entry_hash the
// API reports: it recomputes every hash itself (spec 2.2, 6).

export type FieldType = string // 'int' | 'text' | 'bytes' | 'bool' | 'absent' | 'list<T>' | 'T?'

/** Body layouts, in order. Mirrors contracts/chain/kinds/. */
export const KINDS: Record<string, [string, FieldType][]> = {
  society_opened: [['name', 'text'], ['currency', 'text'], ['fy_start_month', 'int'],
    ['approval_limit_minor', 'int'], ['committee', 'list<text>'], ['roles', 'list<text>']],
  key_registered: [['person', 'text'], ['alg', 'text'], ['public_key', 'bytes']],
  proposal: [['action', 'text'], ['amount_minor', 'int?'], ['currency', 'text?'],
    ['counterparty', 'text?'], ['category', 'text?'], ['narration', 'text'], ['business_date', 'text'],
    ['flat_id', 'text?'], ['target_seq', 'int?'], ['reason', 'text?'],
    ['replacement_amount_minor', 'int?'], ['person', 'text?'], ['role', 'text?'], ['fy', 'text?'],
    ['flat_set', 'text?'], ['flat_ids', 'list<text>'], ['line_amounts', 'list<int>'],
    ['remainder_flats', 'list<text>'], ['tier', 'text'], ['required', 'int'], ['seated', 'int'],
    ['limit_minor', 'int'], ['limit_seq', 'int']],
  approval: [['proposal_seq', 'int'], ['decision', 'text'], ['role', 'text'], ['derived', 'bool'],
    ['proposal_hash', 'bytes'], ['key_seq', 'int'], ['signature', 'bytes']],
  posting: [['proposal_seq', 'int'], ['effect', 'text'], ['amount_minor', 'int?'], ['currency', 'text?'],
    ['limit_minor', 'int?'], ['person', 'text?'], ['role', 'text?'], ['derived', 'bool?']],
  proposal_closed: [['proposal_seq', 'int'], ['outcome', 'text']],
  flag: [['scope', 'text'], ['target_seqs', 'list<int>'], ['counterparty', 'text?'], ['period', 'text?'],
    ['text', 'text']],
  flag_note: [['flag_seq', 'int'], ['note', 'text'], ['text', 'text']],
  month_signoff: [['month', 'text'], ['through_seq', 'int'], ['through_hash', 'bytes'], ['note', 'text?'],
    ['key_seq', 'int'], ['signature', 'bytes']],
  year_close: [['fy', 'text'], ['opinion', 'text'], ['statement', 'text'], ['appointment_seq', 'int'],
    ['through_seq', 'int'], ['through_hash', 'bytes'], ['key_seq', 'int'], ['signature', 'bytes']],
}

/** Exists only for the contract's vectors; a real chain carrying it fails. */
export const TEST_VECTOR: [string, FieldType][] = [['amount_minor', 'int'], ['currency', 'text'],
  ['delta', 'int'], ['note', 'text'], ['empty_note', 'text'], ['optional', 'absent'], ['flag', 'bool'],
  ['ref_hash', 'bytes'], ['ids', 'list<int>'], ['none', 'list<int>']]

export class ChainError extends Error {}

const enc = new TextEncoder()

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

function field(tag: number, value: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + value.length)
  out[0] = tag
  new DataView(out.buffer).setUint32(1, value.length)
  out.set(value, 5)
  return out
}

function int64(n: unknown): Uint8Array {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw new ChainError('int outside the safe range')
  const b = new Uint8Array(8)
  new DataView(b.buffer).setBigInt64(0, BigInt(n))
  return b
}

function text(s: unknown): Uint8Array {
  if (typeof s !== 'string') throw new ChainError('text field is not a string')
  if (!s.isWellFormed()) throw new ChainError('text contains a lone surrogate')
  return enc.encode(s)
}

export function unhex(s: unknown): Uint8Array {
  if (typeof s !== 'string' || !/^(?:[0-9a-f]{2})*$/.test(s)) throw new ChainError('bytes must be lowercase hex')
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function hex(b: Uint8Array): string {
  let s = ''
  for (const x of b) s += x.toString(16).padStart(2, '0')
  return s
}

export function encode(type: FieldType, v: unknown): Uint8Array {
  if (type.endsWith('?')) {
    if (v === null || v === undefined) return field(0, new Uint8Array())
    type = type.slice(0, -1)
  }
  if (type === 'absent') {
    if (v !== null && v !== undefined) throw new ChainError('absent field carries a value')
    return field(0, new Uint8Array())
  }
  if (v === null || v === undefined) throw new ChainError(`required ${type} field is missing`)
  switch (type) {
    case 'int':
      return field(1, int64(v))
    case 'text':
      return field(2, text(v))
    case 'bytes':
      return field(3, unhex(v))
    case 'bool':
      if (typeof v !== 'boolean') throw new ChainError('bool field is not a boolean')
      return field(4, new Uint8Array([v ? 1 : 0]))
  }
  const list = /^list<(.+)>$/.exec(type)
  if (list) {
    if (!Array.isArray(v)) throw new ChainError('list field is not an array')
    return field(5, concat(v.map((item) => encode(list[1]!, item))))
  }
  throw new ChainError(`unknown type ${type}`)
}

export type Entry = {
  format_version: number
  society_id: string
  sequence: number
  prev_hash: string
  kind: string
  recorded_at: number
  actor: string | null
  body: Record<string, unknown>
}

export function preimage(e: Entry, layout = KINDS[e.kind]): Uint8Array {
  if (e.format_version !== 1) throw new ChainError(`unknown format_version ${e.format_version}`)
  if (!layout) throw new ChainError(`unknown kind ${e.kind}: cannot be checked`)
  return concat([
    field(2, enc.encode('clearfunds/chain-entry')),
    field(1, int64(e.format_version)),
    field(2, text(e.society_id)),
    field(1, int64(e.sequence)),
    field(3, unhex(e.prev_hash)),
    field(2, text(e.kind)),
    field(1, int64(e.recorded_at)),
    e.actor === null ? field(0, new Uint8Array()) : field(2, text(e.actor)),
    field(5, concat(layout.map(([name, t]) => encode(t, e.body[name])))),
  ])
}

export async function sha256(b: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource))
}

export const ZERO = '0'.repeat(64)

export type Progress = (done: number) => void

/**
 * Walks a chain from entry 1. Returns the hash this device computed for
 * every entry, by sequence. Throws ChainError on the first failure: a gap,
 * a broken link, an unknown kind, or anything outside the encoding.
 */
export async function walk(entries: Entry[], onProgress?: Progress): Promise<string[]> {
  const hashes: string[] = []
  let prev = ZERO
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!
    if (e.sequence !== i + 1) throw new ChainError(`entry ${i + 1} is missing: the sequence has a gap`)
    if (e.prev_hash !== prev) throw new ChainError(`entry ${e.sequence} does not link to entry ${e.sequence - 1}`)
    if (e.kind === 'test_vector') throw new ChainError(`entry ${e.sequence} has a reserved kind`)
    prev = hex(await sha256(preimage(e)))
    hashes.push(prev)
    if (onProgress && i % 200 === 0) onProgress(i + 1)
  }
  onProgress?.(entries.length)
  return hashes
}

// ---------------------------------------------------------------- signatures

// The bytes each signature covers. Defined by the backend's
// cf.approval_message / cf.signoff_message / cf.close_message; every input
// is in the chain, so a resident's device can rebuild them.
export async function signedMessage(e: Entry): Promise<Uint8Array | null> {
  const b = e.body
  const t = (s: unknown) => field(2, text(s))
  if (e.kind === 'approval') {
    return concat([t('clearfunds/approval'), t(e.society_id), field(1, int64(b.proposal_seq)),
      field(3, unhex(b.proposal_hash)), t(b.decision), t(e.actor)])
  }
  if (e.kind === 'month_signoff') {
    return concat([t('clearfunds/month-signoff'), t(e.society_id), t(b.month), field(1, int64(b.through_seq)),
      field(3, unhex(b.through_hash)), t(e.actor)])
  }
  if (e.kind === 'year_close') {
    return concat([t('clearfunds/year-close'), t(e.society_id), t(b.fy), t(b.opinion),
      field(3, await sha256(text(b.statement))), field(1, int64(b.through_seq)),
      field(3, unhex(b.through_hash)), t(e.actor)])
  }
  return null
}

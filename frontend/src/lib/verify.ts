import * as ed from '@noble/ed25519'
import { ChainError, signedMessage, unhex, walk, type Entry } from './chain'
import { fetchChain } from './api'

// What this device can establish on its own, and nothing more. Every claim
// a screen makes about the record comes from a Check produced here.
//
// The honest limit (AGENTS.md item 9): against the server alone this proves
// the record is internally consistent and that nothing this phone saw
// before has changed. It proves nothing about entries that were never
// served. Only a head published outside the committee, fetched directly,
// closes that, and until one is configured the screen says so.

export type Head = { hash: string; highest_sequence: number; entry_count: number; as_of: number; format_version: number }

export type Memory = { seq: number; hash: string; at: number }

export type Check = {
  at: number
  entries: number
  head: { seq: number; hash: string }
  chain: 'ok' | { failed: string }
  /*
   * Sequences this build has no layout for, so it could not recompute them.
   * Not a failure and never reported as one - a newer backend shipping a new
   * kind puts every un-updated phone here. The screen says what it could not
   * check rather than implying the record is sound or that it is broken.
   */
  unchecked: number[]
  signatures: { checked: number; failed: number[] }
  device: 'first' | 'consistent' | { changed: number }
  anchor: 'unpublished' | 'unreachable' | 'matches' | 'behind' | { mismatch: Head }
  anchorHead?: Head
}

const memKey = (s: string) => `cf-seen:${s}`
const checkKey = (s: string) => `cf-check:${s}`

function read<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}
function write(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage blocked: this visit only */ }
}

export const lastCheck = (society: string) => read<Check>(checkKey(society))

export const anchorUrl = (society: string) => {
  const t = import.meta.env.VITE_ANCHOR_URL
  return t ? t.replace('{society}', encodeURIComponent(society)) : null
}

/** Fetched from the anchor's own origin, never through our server. */
export async function fetchAnchor(society: string): Promise<Head | 'unpublished' | 'unreachable'> {
  const url = anchorUrl(society)
  if (!url) return 'unpublished'
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return 'unreachable'
    const j = await res.json()
    const h = (j.head ?? j) as Head
    if (typeof h.hash !== 'string' || !Number.isSafeInteger(h.highest_sequence)) return 'unreachable'
    return h
  } catch {
    return 'unreachable'
  }
}

export type Step = 'download' | 'fingerprints' | 'signatures' | 'device' | 'anchor'
export type OnStep = (step: Step, done: number, total: number) => void

export async function runCheck(society: string, onStep: OnStep = () => {}): Promise<Check> {
  const anchorP = fetchAnchor(society)
  const entries = await fetchChain(society, (n) => onStep('download', n, n))
  const at = Date.now()
  let hashes: string[] = []
  let unchecked: number[] = []
  let chain: Check['chain'] = 'ok'
  try {
    const walked = await walk(entries, (n) => onStep('fingerprints', n, entries.length))
    hashes = walked.hashes
    unchecked = walked.unchecked
  } catch (e) {
    chain = { failed: e instanceof ChainError ? e.message : 'the record could not be read' }
  }

  const signatures = await checkSignatures(entries, (n, t) => onStep('signatures', n, t))

  // Did anything this phone saw before change?
  onStep('device', 0, 1)
  const mem = read<Memory>(memKey(society))
  let device: Check['device'] = 'first'
  if (mem) {
    const now = hashes[mem.seq - 1]
    device = now === mem.hash ? 'consistent' : { changed: mem.seq }
  }
  const headSeq = hashes.length
  const headHash = hashes.at(-1) ?? ''
  if (chain === 'ok' && device !== 'first' && typeof device === 'object') {
    // Keep the old memory: the evidence of a change must not overwrite itself.
  } else if (chain === 'ok' && headSeq) {
    write(memKey(society), { seq: headSeq, hash: headHash, at } satisfies Memory)
  }

  onStep('anchor', 0, 1)
  const a = await anchorP
  let anchor: Check['anchor']
  if (a === 'unpublished' || a === 'unreachable') anchor = a
  else if (a.highest_sequence > headSeq) anchor = 'behind' // the server served fewer entries than were published
  else anchor = hashes[a.highest_sequence - 1] === a.hash ? 'matches' : { mismatch: a }

  const check: Check = {
    at, entries: entries.length, head: { seq: headSeq, hash: headHash }, chain, unchecked, signatures, device, anchor,
    ...(typeof a === 'object' ? { anchorHead: a } : {}),
  }
  write(checkKey(society), check)
  return check
}

/** Every approval, sign-off and year close against the key the chain registered for its signer. */
async function checkSignatures(entries: Entry[], onProgress: (n: number, total: number) => void) {
  const keys = new Map<number, { person: string; key: Uint8Array }>()
  const signed = entries.filter((e) => e.kind === 'approval' || e.kind === 'month_signoff' || e.kind === 'year_close')
  const failed: number[] = []
  let done = 0
  for (const e of entries) {
    if (e.kind === 'key_registered') {
      try { keys.set(e.sequence, { person: String(e.body.person), key: unhex(e.body.public_key) }) } catch { /* counted below */ }
    }
  }
  for (const e of signed) {
    const k = keys.get(Number(e.body.key_seq))
    let ok = false
    try {
      const msg = await signedMessage(e)
      ok = !!k && !!msg && k.person === e.actor && Number(e.body.key_seq) < e.sequence &&
        (await ed.verifyAsync(unhex(e.body.signature), msg, k.key))
    } catch {
      ok = false
    }
    if (!ok) failed.push(e.sequence)
    if (++done % 100 === 0) onProgress(done, signed.length)
  }
  onProgress(signed.length, signed.length)
  return { checked: signed.length, failed }
}

/** One summary line for the whole check. Never "verified", never "proof". */
export function verdict(c: Check): { tone: 'ok' | 'warn' | 'break'; line: string } {
  if (c.chain !== 'ok') return { tone: 'break', line: 'The record does not hold together. Do not rely on these figures.' }
  if (typeof c.device === 'object') return { tone: 'break', line: `Entry ${c.device.changed} changed since this phone last checked.` }
  if (c.anchor === 'behind' || typeof c.anchor === 'object') return { tone: 'break', line: 'The record differs from the published fingerprint.' }
  if (c.signatures.failed.length) return { tone: 'break', line: `${c.signatures.failed.length} signatures do not match their keys.` }
  /*
   * Everything checkable held. If some entries were not checkable, say so
   * before any reassurance: a resident must not read "matches" and believe
   * it covered entries it could not cover. It stays 'warn', never 'break' -
   * nothing here is evidence against the record.
   */
  if (c.unchecked.length) {
    const n = c.unchecked.length
    return {
      tone: 'warn',
      line:
        n === 1
          ? `Entry ${c.unchecked[0]} is a newer kind this app version cannot check. Everything else held.`
          : `${n} entries are a newer kind this app version cannot check. Everything else held.`,
    }
  }
  if (c.anchor === 'matches') return { tone: 'ok', line: 'Matches the published fingerprint.' }
  return { tone: 'warn', line: 'Consistent on this phone. Not yet compared with a published fingerprint.' }
}

import * as ed from '@noble/ed25519'
import { ChainError, signedMessage, unhex, walk, type Entry } from './chain'
import { fetchChain } from './api'
import { opening, openingLine, type Opening } from './opening'

// What this device can establish on its own, and nothing more. Every claim
// a screen makes about the record comes from a Check produced here.
//
// The honest limit (AGENTS.md item 9): against the server alone this proves
// the record is internally consistent and that nothing this phone saw
// before has changed. It proves nothing about entries that were never
// served. Only a head published outside the committee, fetched directly,
// closes that, and until one is configured the screen says so.
//
// It proves nothing about whether the RIGHT thing was written either. A
// chain opened with no election minutes hashes perfectly, so consistency and
// constitution are separate questions - see opening.ts.

export type Head = { hash: string; highest_sequence: number; entry_count: number; as_of: number; format_version: number }

/*
 * What this phone established on an earlier visit.
 *
 * checkedThrough is the highest sequence at or below which this phone has
 * FULLY recomputed every entry. It exists to stop an unrecognised kind being
 * used to rewrite history: the server chooses what `kind` says, so without
 * this it could relabel an entry this phone had already verified, change the
 * body, report the original hash, and be waved through as merely unreadable.
 * Optional because older clients stored no such field.
 */
export type Memory = { seq: number; hash: string; at: number; checkedThrough?: number }

/*
 * A memory is PARSED, not cast, because localStorage is not ours.
 *
 * It survives across visits on a device anyone may share, and any script
 * that ever runs on this origin can write it. Reading it with a cast let a
 * corrupted value do the two worst things this module can do:
 *
 *   - A value that is not an object (`7`, `[]`) made `mem.seq` undefined,
 *     `hashes[undefined - 1]` undefined, and `undefined === undefined` TRUE,
 *     so the device check reported 'consistent' - positive confirmation that
 *     nothing changed - and a relabelled entry then fell through to the
 *     'warn' branch and was shown as a routine "update the app" version gap
 *     instead of as evidence.
 *   - `checkedThrough: NaN` made `Math.max(NaN, ...)` NaN and `n <= NaN`
 *     always false, disabling regression detection; JSON.stringify writes
 *     NaN as null, so the next visit read 0 and the bound DROPPED. The bound
 *     only ever rises, or the forgery is reported once and then forgotten.
 *
 * So an unreadable memory returns null and the check reports 'first': no
 * claim, rather than a false one. A missing `checkedThrough` is still
 * accepted - older clients stored none - but a present-and-invalid one is
 * not, because that is corruption rather than an older shape.
 */
export function asMemory(v: unknown): Memory | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const m = v as Record<string, unknown>
  if (!Number.isSafeInteger(m.seq) || (m.seq as number) < 1) return null
  if (typeof m.hash !== 'string' || m.hash === '') return null
  if (!Number.isSafeInteger(m.at)) return null
  const t = m.checkedThrough
  if (t === undefined) return { seq: m.seq as number, hash: m.hash, at: m.at as number }
  if (!Number.isSafeInteger(t) || (t as number) < 0) return null
  return { seq: m.seq as number, hash: m.hash, at: m.at as number, checkedThrough: t as number }
}

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
  /*
   * Entries this phone had fully recomputed before and now cannot. Real
   * evidence of tampering, never a version gap: a genuinely new kind can
   * only ever appear ABOVE what this phone has already checked.
   */
  regressed: number[]
  signatures: { checked: number; failed: number[] }
  device: 'first' | 'consistent' | { changed: number }
  anchor: 'unpublished' | 'unreachable' | 'matches' | 'behind' | { mismatch: Head }
  anchorHead?: Head
  /*
   * How the society was opened - society.v1.md's sequence 1 and 2 rule, which
   * a hash walk cannot check because a wrongly-opened chain hashes perfectly.
   *
   * OPTIONAL ON PURPOSE, and this is the field-addition hazard the comment on
   * asCheck() records: `regressed` was added to this type and every cached
   * Check written before that shipped it as `undefined`, which would have
   * blanked the dashboard on `c.regressed.length`. So this field is optional
   * in the type, absent is accepted by the parse, and verdict() treats absent
   * as "not determined" rather than dereferencing it. An old cache must
   * degrade to no claim, never to a false one and never to a crash.
   */
  opening?: Opening
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

/*
 * The cached Check is PARSED too, and for a blunter reason than the memory:
 * it is read during RENDER, and verdict() dereferences four fields without
 * guarding them.
 *
 * `Provenance` sits on the dashboard - the first screen a resident sees -
 * and calls verdict() on whatever came out of storage. There is no error
 * boundary anywhere in the tree, so a shape verdict() cannot read blanks the
 * whole app rather than one card. This is not hypothetical: `regressed` was
 * ADDED to Check, so every device that cached one before that ships
 * `regressed: undefined`, and `c.regressed.length` is a TypeError. A shipped
 * field addition would have blanked the dashboard for existing users.
 *
 * `device: null` is the sharp one - `typeof null === 'object'` passes
 * verdict()'s own check and then dereferences `.changed`.
 *
 * An unreadable cache therefore returns null, which every caller already
 * renders as "not checked on this phone yet" - absent, never a pass. The
 * next runCheck overwrites it.
 */
export function asCheck(v: unknown): Check | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const c = v as Record<string, unknown>
  if (!Number.isSafeInteger(c.at)) return null
  const seqs = (x: unknown) => Array.isArray(x) && x.every((n) => Number.isSafeInteger(n))
  if (!seqs(c.unchecked) || !seqs(c.regressed)) return null
  if (c.chain !== 'ok' && !(typeof c.chain === 'object' && c.chain !== null && typeof (c.chain as { failed?: unknown }).failed === 'string')) return null
  if (c.device !== 'first' && c.device !== 'consistent'
    && !(typeof c.device === 'object' && c.device !== null && Number.isSafeInteger((c.device as { changed?: unknown }).changed))) return null
  const sig = c.signatures
  if (typeof sig !== 'object' || sig === null || Array.isArray(sig)) return null
  if (!Number.isSafeInteger((sig as { checked?: unknown }).checked) || !seqs((sig as { failed?: unknown }).failed)) return null
  /* The anchor's object form carries a Head that `verify.tsx` renders. A
   * string form it does not recognise is refused rather than rendered. */
  const anchor = c.anchor
  const named = anchor === 'unpublished' || anchor === 'unreachable' || anchor === 'matches' || anchor === 'behind'
  if (!named && !(typeof anchor === 'object' && anchor !== null && isHead((anchor as { mismatch?: unknown }).mismatch))) return null
  if (c.anchorHead !== undefined && !isHead(c.anchorHead)) return null
  /*
   * ABSENT IS ACCEPTED, because every Check cached before this field existed
   * has no `opening` - refusing those would discard the stored evidence of a
   * change on upgrade, which is the one thing the memory exists to keep.
   * A PRESENT BUT MALFORMED value is refused, because verdict() reads
   * `.wrong` and `.found` off the object form.
   */
  const o = c.opening
  if (o !== undefined && o !== 'ok' && o !== 'short') {
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return null
    const w = (o as { wrong?: unknown }).wrong
    if (w !== 'kind' && w !== 'purpose' && w !== 'first') return null
    if (typeof (o as { found?: unknown }).found !== 'string') return null
  }
  return c as unknown as Check
}

function isHead(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const h = v as Record<string, unknown>
  return typeof h.hash === 'string' && h.hash !== '' && Number.isSafeInteger(h.highest_sequence)
}

export const lastCheck = (society: string) => asCheck(read<unknown>(checkKey(society)))

/*
 * THE PUBLISHED HEAD'S ADDRESS, WHICH IS ALSO A LINK A RESIDENT CLICKS.
 *
 * Returns null unless the configured value resolves to an absolute http(s)
 * URL. Three things went wrong without that check, and the first two are
 * reachable the first time anyone configures this at all:
 *
 *  - verify.tsx renders `new URL(anchorUrl(s.id)!).host` DURING RENDER. A
 *    relative path - "/anchors/{society}.json", the natural thing to write
 *    when the head is published into our own static hosting - throws
 *    TypeError there, and the boundary then replaces the whole verify screen.
 *    That is the one screen whose purpose is proving the record was not
 *    altered, so losing it is a failure however neatly it is reported.
 *  - vite.config.ts builds the CSP connect-src from the same value and
 *    would throw at dev-server startup.
 *  - the value is also an href. A javascript: or data: URL set here would
 *    make that link a script sink. It is a build-time value rather than
 *    attacker-supplied, but nothing checked it and nothing said it must be
 *    absolute.
 *
 * The society id is encoded, so it cannot escape its slot in the template.
 */
export type Anchor = { href: string; host: string }

export const anchorUrl = (society: string): Anchor | null => {
  const t = import.meta.env.VITE_ANCHOR_URL
  if (!t) return null
  const filled = t.replace('{society}', encodeURIComponent(society))
  let u: URL
  try {
    u = new URL(filled)
  } catch {
    return null
  }
  /*
   * HTTPS ONLY. Settled with the backend 2026-11-07, overriding the earlier
   * reading that a committee self-hosting without TLS was worth allowing.
   *
   * The anchor's whole job is to be a head our server could not have
   * minted. Anything fetched over plain http can be rewritten in transit by
   * whoever carries the packets, so a head served that way proves nothing
   * about the chain - and it fails CLOSED in the worst direction: the check
   * would report "matches" against a fingerprint an attacker supplied.
   *
   * It is also unfetchable in practice. The app is served over https, so a
   * browser blocks an http subresource as mixed content, and the production
   * CSP's connect-src is built from this same value.
   */
  if (u.protocol !== 'https:') return null
  // The host comes from the SAME parse, so no caller ever parses it again.
  return { href: u.href, host: u.host }
}

/*
 * THE PUBLISHED FILE IS FLAT, and its field names are not ours.
 *
 * anchor/v1.md specifies `head_hash`, `head_seq`, `entry_count`, `as_of`,
 * `format_version` at the top level - no `head` wrapper, and no `hash` or
 * `highest_sequence` key anywhere in it. This read `j.head ?? j` and then
 * `h.hash` / `h.highest_sequence`, which are `api_head`'s names: against a
 * real published file both are undefined, the shape check failed, and EVERY
 * anchor read returned 'unreachable'.
 *
 * That is the quietest possible failure for this screen. 'unreachable' is an
 * honest-looking answer - the host could really be down - so the one check
 * that proves no entry was left out reported "couldn't reach it" forever,
 * and nothing distinguished that from a publisher that was never switched
 * on. No test caught it because every fixture was written in our own field
 * names, which is the same mistake the contract exists to prevent.
 *
 * The contract's Unreadable row is three refusals, and each is a case the
 * server could otherwise walk through:
 *  - an unknown `schema_version` is a layout we cannot read. Guessing it is
 *    v1 reads a future file's fields by position.
 *  - an unknown `hash_alg` means the digest we recompute is not the digest
 *    published. A hash comparison between two algorithms is meaningless, and
 *    would read as a mismatch rather than as unreadable.
 *  - a `society_id` that is not the society being checked is the real attack:
 *    a valid, correctly signed anchor for a DIFFERENT society would pass
 *    every other check here while proving nothing about this one.
 *
 * `entry_count` is carried through because the contract's pass condition has
 * two halves - the head hash matches AND the entries received number exactly
 * `entry_count`. Dropping the count keeps the half that a rebuilt-and-
 * renumbered chain satisfies.
 */
const ANCHOR_SCHEMA = 1
const ANCHOR_HASH_ALG = 'sha256'

export async function fetchAnchor(society: string): Promise<Head | 'unpublished' | 'unreachable'> {
  const a = anchorUrl(society)
  if (!a) return 'unpublished'
  try {
    const res = await fetch(a.href, { cache: 'no-store' })
    /*
     * A 404 is "not published", not "unreachable". The contract separates
     * them: a society younger than a month plus 5 days has nothing to
     * publish yet, and reporting that as a failure to reach the host would
     * make an ordinary new society look like a broken one.
     */
    if (res.status === 404) return 'unpublished'
    if (!res.ok) return 'unreachable'
    const j = (await res.json()) as Record<string, unknown>
    if (typeof j !== 'object' || j === null) return 'unreachable'
    if (j.schema_version !== ANCHOR_SCHEMA) return 'unreachable'
    if (j.hash_alg !== ANCHOR_HASH_ALG) return 'unreachable'
    if (j.society_id !== society) return 'unreachable'
    const hash = j.head_hash
    const seq = j.head_seq
    const count = j.entry_count
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return 'unreachable'
    if (!Number.isSafeInteger(seq) || (seq as number) < 1) return 'unreachable'
    if (!Number.isSafeInteger(count) || (count as number) < 0) return 'unreachable'
    return {
      hash,
      highest_sequence: seq as number,
      entry_count: count as number,
      as_of: Number.isSafeInteger(j.as_of) ? (j.as_of as number) : 0,
      format_version: Number.isSafeInteger(j.format_version) ? (j.format_version as number) : 0,
    }
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
  const mem = asMemory(read<unknown>(memKey(society)))
  let device: Check['device'] = 'first'
  if (mem) {
    /*
     * An absent hash is NOT a match. The chain may be shorter than it was,
     * or unreadable at that point; either way this phone cannot confirm the
     * entry it recorded, which is a change, not a consistency.
     */
    const now = hashes[mem.seq - 1]
    device = typeof now === 'string' && now === mem.hash ? 'consistent' : { changed: mem.seq }
  }

  /*
   * An entry this phone already recomputed must never become unreadable.
   *
   * The server chooses what `kind` says, so an unrecognised kind is the one
   * place a rewrite could hide: relabel a verified entry, change the body,
   * report its original hash, and every later hash still matches - the head,
   * the anchor and the device memory all agree, and the entry also drops out
   * of checkSignatures, which filters by kind. Splitting the sequences on
   * what this phone had already covered is what separates an honest version
   * gap (always ABOVE checkedThrough) from that rewrite (at or below it).
   */
  const coveredBefore = mem?.checkedThrough ?? 0
  const regressed = unchecked.filter((n) => n <= coveredBefore)

  const headSeq = hashes.length
  const headHash = hashes.at(-1) ?? ''
  /*
   * Only sequences below the first unchecked entry are fully recomputed this
   * visit. Never let it go backwards: a phone that once checked through 50
   * keeps that, so a later relabel of entry 20 is still caught.
   */
  const firstUnchecked = unchecked.length ? Math.min(...unchecked) : Infinity
  const checkedNow = Math.min(headSeq, firstUnchecked - 1)
  const checkedThrough = Math.max(coveredBefore, Math.max(0, checkedNow))

  if (chain === 'ok' && device !== 'first' && typeof device === 'object') {
    // Keep the old memory: the evidence of a change must not overwrite itself.
  } else if (chain === 'ok' && regressed.length) {
    // Same reason: this is evidence, so it must not overwrite what proves it.
  } else if (chain === 'ok' && headSeq) {
    write(memKey(society), { seq: headSeq, hash: headHash, at, checkedThrough } satisfies Memory)
  }

  onStep('anchor', 0, 1)
  const a = await anchorP
  let anchor: Check['anchor']
  if (a === 'unpublished' || a === 'unreachable') anchor = a
  else if (a.highest_sequence > headSeq) anchor = 'behind' // the server served fewer entries than were published
  /*
   * BOTH HALVES OF THE CONTRACT'S PASS CONDITION. The recomputed hash at
   * head_seq must match, AND the entries received for 1..head_seq must
   * number exactly entry_count. Sequences are contiguous by construction,
   * so a count that disagrees is a gap, and anchor/v1.md says a client
   * treats any gap as tampering.
   *
   * Checking only the hash is what an operator who rebuilt the chain
   * without some entries, renumbered 1..N, would satisfy. The count is the
   * half that does not come free with a consistent rehash.
   */
  else if (hashes[a.highest_sequence - 1] !== a.hash) anchor = { mismatch: a }
  else anchor = a.entry_count === a.highest_sequence ? 'matches' : { mismatch: a }

  /*
   * Read from the entries the server served, independent of whether the walk
   * succeeded: a chain that fails its hashes is already reported as 'break',
   * and one that passes them can still have been opened wrongly. The two
   * findings are about different things, so neither gates the other.
   */
  const open = opening(entries)

  const check: Check = {
    at, entries: entries.length, head: { seq: headSeq, hash: headHash }, chain, unchecked, regressed,
    signatures, device, anchor, opening: open,
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

/**
 * What the Steps may show, given a cached check and how the current run went.
 *
 * The screen keeps the last check in localStorage so it has something to
 * render before the first run finishes. That is also what it still holds
 * when a run FAILS - and a cached pass redrawn with a green tick, no date
 * and "No gaps, no broken links" is a reassurance about a run that did not
 * happen, on the one screen whose job is to say whether the record can be
 * trusted.
 *
 * Four outcomes, never two, and `failed` is read BEFORE `check`, because a
 * failed run arrives *with a cached check in hand* - the same shape as a
 * background refetch that errors while the last good data is still there.
 *
 * - 'running'  a run is in flight: show progress, no result.
 * - 'none'     nothing cached and nothing ran: show neither.
 * - 'stale'    the run failed and a prior check is all we have. Its findings
 *              are still true *of their own date*, so they are shown - dated,
 *              and never as a current pass.
 * - 'current'  the run that just finished is what is on screen.
 *
 * Returns the date to attribute a 'stale' reading to, so a caller cannot
 * render one without it.
 */
export function stepsView(
  check: Check | null,
  opts: { running: boolean; failed: boolean },
): { show: 'running' } | { show: 'none' } | { show: 'current' } | { show: 'stale'; at: number } {
  if (opts.running) return { show: 'running' }
  if (!check) return { show: 'none' }
  if (opts.failed) return { show: 'stale', at: check.at }
  return { show: 'current' }
}

/** One summary line for the whole check. Never "verified", never "proof". */
export function verdict(c: Check): { tone: 'ok' | 'warn' | 'break'; line: string } {
  if (c.chain !== 'ok') return { tone: 'break', line: 'The record does not hold together. Do not rely on these figures.' }
  if (typeof c.device === 'object') return { tone: 'break', line: `Entry ${c.device.changed} changed since this phone last checked.` }
  /*
   * An entry this phone had already recomputed can no longer be read. A new
   * kind cannot do that - it would be above what was checked - so this is a
   * relabel, and it is evidence, not a version gap.
   */
  if (c.regressed.length) {
    const n = c.regressed[0]!
    return { tone: 'break', line: `Entry ${n} was checked on this phone before and now cannot be. Do not rely on these figures.` }
  }
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
          ? `Entry ${c.unchecked[0]} is of a kind this app version does not recognise, so its contents were not checked. Update the app to check it.`
          : `${n} entries are of a kind this app version does not recognise, so their contents were not checked. Update the app to check them.`,
    }
  }
  /*
   * How the society was opened. Below every 'break' because it is not
   * evidence of tampering - an older server is the likelier cause - and
   * ABOVE both reassurances because "Matches the published fingerprint" must
   * not be the last word on a chain that was never properly opened. The
   * fingerprint genuinely does match; it is simply not the question.
   *
   * `undefined` falls through deliberately: a cache from before this field
   * makes no claim either way, and inventing one from its absence would be a
   * false finding on an old device.
   */
  if (c.opening !== undefined && c.opening !== 'ok') {
    return { tone: 'warn', line: openingLine(c.opening)! }
  }
  if (c.anchor === 'matches') return { tone: 'ok', line: 'Matches the published fingerprint.' }
  return { tone: 'warn', line: 'Consistent on this phone. Not yet compared with a published fingerprint.' }
}

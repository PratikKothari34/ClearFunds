import type { Entry } from './types'

/*
 * Re-exported so the many files that already reach for  to
 * render a row do not each need a second import. It is a RE-EXPORT and not
 * a definition:  owns the shape, and there is exactly one of it.
 */
export type { Entry } from './types'

/*
 * THE LEDGER'S PRESENTATION RULES.
 *
 * Pure functions only. This file computes NO money - every amount and every
 * running balance arrives already computed by the server from signed,
 * chained entries.
 *
 * What it does do is PAIR a reversed entry with its reversal and ORDER the
 * chain, both of which are rules rather than rendering, and so belong here
 * rather than in a route file: a rule left in a route cannot be tested
 * without mounting a router, so it does not get tested.
 *
 * `Entry` ITSELF LIVES IN `types.ts`, which is the contract of record and
 * the shape the backend is handed. This file briefly declared a second,
 * narrower `Entry` of its own during the restyle; two schemas for one
 * concept is how `verify.tsx` came to import both and how a field can be
 * added to one and silently missed on the other.
 */

export type Row =
  | { readonly kind: 'entry'; readonly entry: Entry }
  | {
      readonly kind: 'reversedPair'
      readonly original: Entry
      readonly reversal: Entry
    }

/*
 * Pairs each reversal with the entry it cancels.
 *
 * Entries arrive newest-first, so a reversal is encountered BEFORE its
 * original. The pair is emitted at the reversal's position - where the
 * correction actually happened in the chain - because that is the position
 * its amount affected the balance.
 *
 * An orphan is NEVER dropped. A reversal whose original is not in this page
 * of history, or an entry marked reversed whose reversal is missing, renders
 * on its own. Dropping it would hide a record the chain exists to prove, and
 * a short page is a far more likely cause than a missing entry.
 */
export function pair(entries: readonly Entry[]): Row[] {
  const byId = new Map<string, Entry>()
  for (const e of entries) byId.set(e.id, e)

  /* Which originals have been consumed into a pair already. */
  const consumed = new Set<string>()
  const rows: Row[] = []

  for (const entry of entries) {
    if (consumed.has(entry.id)) continue

    if (entry.state === 'reversal' && entry.reverses !== undefined) {
      const original = byId.get(entry.reverses.id)
      if (original !== undefined) {
        rows.push({ kind: 'reversedPair', original, reversal: entry })
        consumed.add(original.id)
        continue
      }
      /* Orphaned reversal: the original is outside this page. Still shown. */
    }

    rows.push({ kind: 'entry', entry })
  }

  return rows
}

/*
 * THE RULE: an entry can be reversed at most once, and a reversal cannot
 * itself be reversed.
 *
 * Balances then net a reversed pair to zero BY CONSTRUCTION rather than by
 * special-casing, and a reversal cannot be used as a laundering path.
 *
 * This validates what arrived rather than enforcing it - enforcement is the
 * server's, since only it can see the whole chain. A violation here means a
 * contract breach, and the surface must say so instead of rendering a
 * plausible ledger built on it.
 */
export interface ChainComplaint {
  readonly entryId: string
  readonly problem: string
}

export function complaints(entries: readonly Entry[]): ChainComplaint[] {
  const found: ChainComplaint[] = []
  const reversalsOf = new Map<string, string[]>()
  const byId = new Map<string, Entry>()
  for (const e of entries) byId.set(e.id, e)

  for (const e of entries) {
    if (e.state !== 'reversal') continue

    if (e.reverses === undefined) {
      found.push({
        entryId: e.id,
        problem: 'a reversal that does not say which entry it reverses',
      })
      continue
    }
    if (
      e.reversalReason === undefined ||
      e.reversalReason.trim().length === 0
    ) {
      // The reason is mandatory: a correction without one is unauditable.
      found.push({
        entryId: e.id,
        problem: 'a reversal with no stated reason',
      })
    }

    const target = byId.get(e.reverses.id)
    if (target !== undefined && target.state === 'reversal') {
      found.push({
        entryId: e.id,
        problem: 'a reversal of a reversal, which is never permitted',
      })
    }

    const list = reversalsOf.get(e.reverses.id) ?? []
    list.push(e.id)
    reversalsOf.set(e.reverses.id, list)
  }

  for (const [originalId, reversalIds] of reversalsOf) {
    if (reversalIds.length > 1) {
      found.push({
        entryId: originalId,
        problem: `reversed ${reversalIds.length} times; an entry may be reversed at most once`,
      })
    }
  }

  return found
}

/*
 * Formats an entry's timestamp for display. Parses only to format - no
 * duration, no difference, no comparison is computed from it.
 *
 * Returns null on an unparseable value rather than "Invalid Date", which
 * would be rendered to a resident verbatim.
 */
export function formatPostedAt(
  iso: string,
  locale = 'en-IN',
): { date: string; time: string } | null {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  const d = new Date(ms)
  return {
    date: new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d),
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d),
  }
}

/*
 * ---------------------------------------------------------------------------
 * THE LEDGER AS A SEQUENCE.
 *
 * Rules about the ORDER of entries, kept out of the route files for the
 * reason `lib/` exists: a helper left inside a route cannot be tested
 * without mounting a router, so it does not get tested - which is how every
 * bug these functions exist to prevent survived its first review.
 *
 * `sequence` is the chain position and is the ordering key throughout.
 * `id` is an opaque identifier and is never ordered on: it is a string,
 * and sorting it would order #10 before #9.
 * ---------------------------------------------------------------------------
 */

/**
 * The newest entry, chosen by chain position rather than array position.
 *
 * `entries[0]` is only the newest while the list happens to arrive sorted
 * newest-first, and nothing in the wire contract promises that. The
 * assumption is invisible exactly as long as it holds, and the surface that
 * depends on it - the record-check page, naming which entry was compared
 * against the published chain head - is the one place where a confidently
 * wrong answer undermines the product's central claim.
 *
 * THE VALUE CHECK, NOT ONLY THE ORDERING ONE. Deriving the maximum guards
 * the array-POSITION assumption; it does not guard the VALUE. Every
 * comparison against NaN is false, so `e.sequence > newest.sequence` neither accepts nor
 * rejects a malformed position - it leaves the answer to where the row sits.
 * A row with no usable sequence placed first is taken by the `undefined` branch
 * and then nothing can beat it, so the genuinely newest entry is discarded.
 *
 * The visible version of that bug is `#NaN`. The dangerous version is an OLD
 * entry that merely lost its id being named as the newest, with a real
 * number and a real date beside it, on the one page whose job is to state
 * what was compared.
 *
 * `Number.isInteger` rather than `typeof === 'number'`, which admits NaN.
 * Dropping an unusable row is right here: the page already renders "None"
 * for no entry, which is honest, and `#NaN` is not.
 */
export function newestEntry(entries: readonly Entry[]): Entry | undefined {
  return entries.reduce<Entry | undefined>((newest, e) => {
    if (!Number.isInteger(e.sequence)) return newest
    if (newest === undefined) return e
    return e.sequence > newest.sequence ? e : newest
  }, undefined)
}

/**
 * The entries to list, newest first by chain position.
 *
 * The ledger's rows are read top to bottom as a running balance, so array
 * order IS the claim the page makes about sequence. Nothing in the wire
 * contract promises the server sends them sorted.
 *
 * Sorted on `sequence`, never `postedAt`: a reversal can post in the same minute
 * as the entry it cancels, and two equal timestamps leave the order
 * undefined again. The chain position is total by construction.
 *
 * Rows with no usable position go LAST rather than being dropped. This is a
 * display order, not a correctness gate - silently hiding an entry from the
 * history is the one thing this product must never do, and the row still
 * renders its own amount and date honestly.
 */
export function inChainOrder(entries: readonly Entry[]): readonly Entry[] {
  return [...entries].sort((a, b) => {
    const aOk = Number.isInteger(a.sequence)
    const bOk = Number.isInteger(b.sequence)
    if (!aOk && !bOk) return 0
    if (!aOk) return 1
    if (!bOk) return -1
    return b.sequence - a.sequence
  })
}

/**
 * The reversed entries to list as top-level rows.
 *
 * A reversed entry and its reversal are ONE row item by design - the
 * reversal renders beside the entry it cancels, never as its own row.
 * Admitting `state === 'reversal'` as a top-level row therefore lists one
 * correction twice: once struck through as money paid out, once again as
 * money received, with the same reason under both and a count above saying
 * two entries. For a non-technical resident that reads as twice the
 * movement, on the one tab that exists to explain corrections.
 *
 * A reversal whose cancelled entry is NOT in the same list is kept, because
 * dropping it would hide a real chain entry: on a filtered or paginated
 * response the pair can be split, and an orphan reversal explained by a link
 * is better than a correction that is absent.
 */
export function reversedRows(entries: readonly Entry[]): readonly Entry[] {
  const listedIds = new Set(entries.map((e) => e.id))
  return entries.filter((e) => {
    if (e.state === 'reversed') return true
    if (e.state !== 'reversal') return false
    /* Orphan only: no row above already carries it. */
    if (e.reverses === undefined) return true
    return !listedIds.has(e.reverses.id)
  })
}

/**
 * Whether a comparison against the published record actually happened.
 *
 * The chain-head status and the ledger are two independent reads, coupled
 * only by sitting on the same page. With a matching head and no entries -
 * which is exactly what a build with no backend holds - the page prints
 * "Newest entry here: None" directly above "Nothing in the history has been
 * changed since it was published." Zero entries were compared and the page
 * states the history matches, on the one surface carrying the product's
 * central claim.
 */
export function comparedAnything(entries: readonly Entry[]): boolean {
  return newestEntry(entries) !== undefined
}

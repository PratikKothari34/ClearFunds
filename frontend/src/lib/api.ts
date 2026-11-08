import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap, edge, bytea } from './supabase'
import { useMeStrict } from './session'
import { array, int, object, parse, required, str } from './parse'
import type { Parser } from './parse'
/*
 * `people` and `seats` are imported under pf-/sf- names because useCommittee
 * binds locals with those exact names. A shadowed parser is not a type error
 * - it silently resolves to the local array and parses nothing.
 */
import {
  chargePreview, disputeRow, duesRows, ledgerRow, limitEntries, people as peopleRows,
  proposalRow, report, resolvedHandle, seats as seatRows, signoffEntries,
  summary, years,
} from './rows'
import type { Entry } from './chain'

export const PAGE = 1000

/**
 * The ceiling on the sequential fallback walk, NOT a limit on a society's
 * history - the planned path has no such bound and never consults this.
 *
 * It exists so a loop whose only exit is a short page cannot run forever.
 * Set far above any real society: 150 flats appending for decades is tens of
 * thousands of entries, so this is centuries of headroom and a refusal here
 * means something is broken, never that a committee was too busy.
 */
export const MAX_ROWS = 500_000

/**
 * The sequential walk's stop decision, extracted so it can be tested.
 *
 * `all()` itself needs a network, so the loop around this was unreachable by
 * any test - and an untested bound is the dead-check class: it looks like a
 * guard and would wave through the thing it was added to stop.
 *
 * Three answers, and the middle one is the whole point:
 *   'done'     - a short page, so that was the end of the view
 *   'continue' - a full page and room left under the ceiling
 *   'refuse'   - a full page at the ceiling, which means the exit condition
 *                is never coming. THROW, never return what we have: a
 *                truncated history reported as complete is a wrong running
 *                balance, and that is the failure this product exists to
 *                prevent.
 */
export function walkStep(lastLen: number, nextFrom: number): 'done' | 'continue' | 'refuse' {
  if (lastLen < PAGE) return 'done'
  return nextFrom <= MAX_ROWS ? 'continue' : 'refuse'
}

/**
 * The `from` offsets still to fetch after the first page has come back.
 *
 * Extracted because the decision is the whole risk of paginating in parallel
 * and it cannot be tested through `all()` without a network: get it wrong by
 * one page and the ledger silently loses or duplicates a thousand entries,
 * which a running balance reports as a wrong figure rather than an error.
 *
 * `total` is the row count the server reported, or undefined when it did not
 * report one.
 *   - a short first page means that was everything -> nothing more to fetch
 *   - no count means we cannot plan -> undefined, and the caller walks in
 *     sequence instead of assuming one page was all of it
 *   - a count BELOW the page just read contradicts it -> undefined too, for
 *     the same reason: a full page proves those rows exist, so a total of 0
 *     or -1 is nonsense and must not be planned from
 *   - otherwise, one offset per remaining page
 */
export function restPages(firstLen: number, total: number | null | undefined): number[] | undefined {
  if (firstLen < PAGE) return []
  if (typeof total !== 'number' || !Number.isFinite(total)) return undefined
  /*
   * A full first page is direct evidence of at least PAGE rows, so a total
   * BELOW that contradicts what we just read and cannot be planned from.
   * Without this, a count of 0 or -1 took the `pages - 1 = 0` path and
   * returned [] - "that was everything" - truncating the ledger to its first
   * page and reporting no error. Math.max(0, ...) made that look deliberate.
   * Falling through to the sequential walk is slow and right.
   */
  if (total < firstLen) return undefined
  const pages = Math.ceil(total / PAGE)
  return Array.from({ length: pages - 1 }, (_, i) => (i + 1) * PAGE)
}

/**
 * Reads every row of a view in pages, in sequence order.
 *
 * Takes a PARSER, not a type argument. A type argument here was the widest
 * hole in the app: `all<LedgerRow>(...)` made the compiler vouch for the
 * shape of the entire ledger with nothing checking a single field at
 * runtime. Each page is parsed as it arrives, so a malformed row fails the
 * query at the page that contained it, naming the field.
 *
 * The pages after the first go out TOGETHER. Walking them in sequence meant
 * each round-trip waited on the one before it, and this is the app's largest
 * read: a 150-flat society five years in carries roughly 11,000 entries, so
 * eleven chained requests stood between opening the app and seeing a figure.
 * `count: 'exact'` on the first page says how many rows exist, and the rest
 * are fetched in parallel and stitched back in range order.
 *
 * Still parsed per page, with the same range in the label, so a malformed row
 * names the page it came from whether that page was fetched first or last.
 * Promise.all rejects on the first failure, which is what a ledger wants - a
 * partial history would compute a running balance from rows it did not have.
 */
async function all<T>(
  view: 'ledger' | 'proposals' | 'disputes',
  rowParser: Parser<T>,
  society: string,
  order = 'seq',
): Promise<T[]> {
  const pageParser = array(rowParser)
  const page = (from: number, count?: 'exact') =>
    supabase.from(view).select('*', count ? { count } : undefined)
      .eq('society_id', society).order(order).range(from, from + PAGE - 1)
  const take = (raw: unknown, from: number) =>
    parse(pageParser, raw, `${view} rows ${from}-${from + PAGE - 1}`)

  const head = await page(0, 'exact')
  const first = take(unwrap(head), 0)

  const offsets = restPages(first.length, head.count)

  /*
   * undefined means the server reported no count, so there is no way to know
   * whether more rows exist. Walk in sequence rather than return what might
   * be a truncated ledger - slow is recoverable, a silently short history is
   * a wrong running balance.
   */
  if (offsets === undefined) {
    const out = [...first]
    /*
     * The `for` header carries no bound: `walkStep` holds it, so the stop
     * decision is testable without a network. The loop is bounded all the
     * same - 'refuse' throws out of it.
     *
     * It needs one, because the exit condition is a short page and nothing
     * here enforces what makes that certain. `order` defaults to 'seq', which is
     * unique and append-only, so `range` walks a stable result set - but a
     * caller passing a non-unique column, or a server returning a full page
     * past the end, would spin forever allocating rows in a tab that cannot
     * be closed by a resident who only wanted to read a balance.
     *
     * A throw is the right failure: it reaches the render boundary, names
     * the view, and loses one screen. The silent alternative is returning
     * `out` as though it were complete, which is the truncated-ledger bug
     * this whole path exists to avoid.
     */
    for (let from = PAGE; ; from += PAGE) {
      const rows = take(unwrap(await page(from)), from)
      out.push(...rows)
      const step = walkStep(rows.length, from + PAGE)
      if (step === 'done') return out
      if (step === 'refuse') {
        throw new Error(
          `${view}: more than ${MAX_ROWS} rows without a short page; refusing to return a possibly truncated history`,
        )
      }
    }
  }

  const rest = await Promise.all(offsets.map(async (from) => take(unwrap(await page(from)), from)))
  return [first, ...rest].flat()
}

export function useSociety() {
  return useMeStrict().society
}

export function useLedger() {
  const s = useSociety()
  return useQuery({ queryKey: ['ledger', s.id], queryFn: () => all('ledger', ledgerRow, s.id) })
}

export function useProposals() {
  const s = useSociety()
  return useQuery({ queryKey: ['proposals', s.id], queryFn: () => all('proposals', proposalRow, s.id) })
}

export function useDisputes() {
  const s = useSociety()
  return useQuery({ queryKey: ['disputes', s.id], queryFn: () => all('disputes', disputeRow, s.id) })
}

export function useTenantFlags() {
  const s = useSociety()
  return useQuery({
    queryKey: ['tenant-flags', s.id],
    queryFn: async () => new Set(unwrap(await supabase.rpc('api_my_tenant_flags', { p_society: s.id })) as number[]),
  })
}

/*
 * Parsed, not cast. database.types.ts types every column nullable because
 * every view column is; the parser states which of those the read model
 * actually guarantees, so a contract violation fails the query instead of
 * reaching a surface. The amounts stay nullable on purpose - an unreadable
 * figure is disclosed by countable.ts rather than blanking the screen.
 */
export function useDues() {
  const s = useSociety()
  return useQuery({
    queryKey: ['dues', s.id],
    queryFn: async () =>
      parse(duesRows, unwrap(await supabase.from('flat_dues').select('*').eq('society_id', s.id).order('ordinal')), 'useDues'),
  })
}

export function useCommittee() {
  const s = useSociety()
  return useQuery({
    queryKey: ['committee', s.id],
    /*
     * The two reads are INDEPENDENT, so they go out together. Awaiting seats
     * and then people made one round-trip wait on the other for no reason,
     * and this hook gates /committee and /new.
     *
     * Each response is still parsed with its own label, so a malformed row
     * still names which read it came from. Promise.all rejects on the first
     * failure, which is what the query wants: a partial committee is not a
     * committee, and showing seats without the names to resolve them would
     * render every member as an unknown id.
     */
    queryFn: async () => {
      const [rawSeats, rawPeople] = await Promise.all([
        supabase.from('committee_seats').select('person_id,role,derived,seated_seq,unseated_seq')
          .eq('society_id', s.id).order('seated_seq'),
        supabase.from('people').select('id,full_name,email,phone').eq('society_id', s.id),
      ])
      return {
        seats: parse(seatRows, unwrap(rawSeats), 'useCommittee seats'),
        people: parse(peopleRows, unwrap(rawPeople), 'useCommittee people'),
      }
    },
  })
}

/** Names of the people who act on the record: committee and auditors. */
export function useNames() {
  const c = useCommittee()
  return useMemo(() => {
    const m = new Map<string, string>()
    for (const p of c.data?.people ?? []) m.set(p.id, p.full_name)
    return m
  }, [c.data])
}

export function useYears() {
  const s = useSociety()
  return useQuery({
    queryKey: ['years', s.id],
    queryFn: async () => parse(years, unwrap(await supabase.rpc('api_years', { p_society: s.id })), 'useYears'),
  })
}

export function useReport(fy: string | undefined) {
  const s = useSociety()
  return useQuery({
    queryKey: ['report', s.id, fy],
    enabled: !!fy,
    queryFn: async () => parse(report, unwrap(await supabase.rpc('api_report', { p_society: s.id, p_fy: fy! })), 'useReport'),
  })
}

/*
 * There is no useStructuring. `api_report` already returns the structuring
 * aggregates and the AGM report renders them (routes/reports.tsx), which is
 * where 0004 says they belong - in the report, marked crossed. A second hook
 * on api_structuring fetched the same aggregate by a different path for a
 * standalone screen that was never built, so the two could disagree about
 * which below-limit payments crossed the limit with nothing to say which was
 * right. `rows.ts` keeps the `structuring` row parser - the report's own
 * schema wraps it with array() inline - but not the standalone array export,
 * which existed only for this hook.
 */

export function useSignoffs() {
  const s = useSociety()
  return useQuery({
    queryKey: ['signoffs', s.id],
    queryFn: async () =>
      parse(
        signoffEntries,
        unwrap(
          await supabase.from('chain_entries').select('sequence,recorded_at,actor,body')
            .eq('society_id', s.id).eq('kind', 'month_signoff').order('sequence'),
        ),
        'useSignoffs',
      ),
  })
}

/** The limit in force, read from the chain like the server reads it. */
export function useLimit() {
  const s = useSociety()
  return useQuery({
    queryKey: ['limit', s.id],
    queryFn: async () => {
      const rows = parse(
        limitEntries,
        unwrap(
          await supabase.from('chain_entries').select('sequence,kind,body,recorded_at').eq('society_id', s.id)
            .or('kind.eq.society_opened,and(kind.eq.posting,body->>effect.eq.limit)').order('sequence'),
        ),
        'useLimit',
      )
      /*
       * The limit each entry was approved against. `?? 0` is NOT a default
       * here - a zero limit makes everything N-of-M by 0006, so falling back
       * to it on a missing field would silently claim the strictest tier was
       * in force when nobody knows what was. Parsing the body means a limit
       * entry without a limit fails the query instead.
       */
      const history = rows.map((r) => ({
        seq: r.sequence,
        recorded_at: r.recorded_at,
        limit_minor: r.kind === 'society_opened' ? r.body.approval_limit_minor : r.body.limit_minor,
      }))
      if (history.length === 0) throw new Error('useLimit: the chain carries no approval limit at all')
      return { current: history.at(-1)!, history }
    },
  })
}

/** Every chain entry, for this device to check on its own. */
export async function fetchChain(society: string, onPage?: (n: number) => void): Promise<Entry[]> {
  const out: Entry[] = []
  for (let from = 0; ; from += PAGE) {
    const rows = unwrap(
      await supabase.from('chain_entries')
        .select('format_version,society_id,sequence,prev_hash,kind,recorded_at,actor,body')
        .eq('society_id', society).order('sequence').range(from, from + PAGE - 1),
    )
    /*
     * NOT parsed against a row schema, deliberately. These are the raw chain
     * entries this device re-hashes itself, and chain.ts must see exactly
     * what the server sent - including a malformed body, which is a finding
     * rather than a reason to drop the page. verify.ts decides; a parser here
     * would reject the very entry it needs to report.
     */
    for (const r of rows) out.push({ ...r, prev_hash: bytea(r.prev_hash) } as unknown as Entry)
    onPage?.(out.length)
    if (rows.length < PAGE) return out
  }
}

/** Keeps open screens current: a new entry anywhere refreshes the read models. */
/*
 * Every read a chain entry can change. The kind is not in the realtime
 * payload, so narrowing by kind would mean trusting a guess about what an
 * insert touched.
 *
 * This list has drifted twice, in both directions, which is why
 * `live.test.ts` now derives the full set of query keys from the source and
 * asserts this list against it. 'head' and 'structuring' were names that were
 * never query keys at all, so invalidating them did nothing. 'tenant-flags'
 * IS a key and was missing, so a flag raised on another device left this
 * one's set stale until a reload. 'me' was missing for the same reason and is
 * the worst of the three: it carries the viewer's SEAT, and seating is a
 * chain entry (`seat_admin`, `unseat_admin`, `appoint_auditor`). A treasurer
 * seated mid-session saw no approval controls, and an auditor appointed
 * mid-session got no year-end screen, because `nav.ts`, `pending.ts` and
 * every `isCommittee` gate read `me.seat` - and `useMe` holds it for
 * `staleTime: 60_000`, or indefinitely while the tab stays mounted.
 *
 * It is a stale-SCREEN defect, not an access one: the server refuses what the
 * seat does not permit either way. The screen being wrong about who you are
 * is still the kind of thing a volunteer reports as the app being broken.
 *
 * EXCLUDED ON PURPOSE, and `live.test.ts` pins each reason:
 *   'entry', 'alloc'  - one past entry's hash or body. Append-only, so the
 *                       row cannot change once written.
 *   'preview'         - a server computation keyed on the viewer's own form
 *                       input, not on society state.
 *   'flats'           - the flat registry, not a chain entry. A new flat
 *                       arrives out of band and no insert signals it.
 */
const LIVE_KEYS = [
  'ledger', 'proposals', 'disputes', 'dues', 'committee',
  'years', 'report', 'signoffs', 'limit', 'tenant-flags', 'me',
] as const

/** Query keys a chain insert deliberately does NOT refresh. See above. */
export const NOT_LIVE = ['entry', 'alloc', 'preview', 'flats'] as const

export const LIVE_KEYS_FOR_TEST = LIVE_KEYS

export function useLive(society: string) {
  const qc = useQueryClient()
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const ch = supabase
      .channel(`chain:${society}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chain_entries', filter: `society_id=eq.${society}` },
        () => {
          clearTimeout(t)
          t = setTimeout(() => {
            /*
             * Everything the viewer is looking at refetches, because these
             * are the figures on screen and an append-only ledger that shows
             * yesterday's total is wrong, not merely slow. The dashboard
             * mounts nine of these and they are all small reads.
             *
             * The LEDGER is the exception, and the reason this is not one
             * call. `all()` walks the society's entire history in 1000-row
             * pages, each waiting on the last, so refetching it per insert is
             * the one genuinely expensive thing here - a committee working
             * through a backlog paid that repeatedly. It is marked stale
             * WITHOUT refetching (`refetchType: 'none'`): the rows already on
             * screen stay, and Query re-reads on the next mount or window
             * focus.
             *
             * Any query NOT mounted is left stale either way - no inactive
             * read is fetched here just to warm a cache.
             *
             * `exact: true` on the ledger matters: Query matches by key
             * PREFIX, and useSummary's key is ['ledger', 'summary', id]. A
             * prefix invalidation would sweep the summary in with the full
             * history and leave the dashboard's headline balance stale with
             * nothing refetching it - the one figure a resident opens the app
             * to read.
             */
            qc.invalidateQueries({ queryKey: ['ledger', society], exact: true, refetchType: 'none' })
            qc.invalidateQueries({ queryKey: ['ledger', 'summary', society], exact: true, refetchType: 'active' })
            for (const k of LIVE_KEYS) {
              if (k !== 'ledger') qc.invalidateQueries({ queryKey: [k], refetchType: 'active' })
            }
          }, 400)
        })
      .subscribe()
    return () => {
      clearTimeout(t)
      supabase.removeChannel(ch)
    }
  }, [society, qc])
}

// ---------------------------------------------------------------- writes

function useWrite<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => qc.invalidateQueries(),
  })
}

/*
 * Every edge function's response is parsed, for the reason in `all` above: a
 * type argument on `edge<T>` is a cast, so a missing `seq` arrived as
 * `undefined` and was typed `number`.
 *
 * `status` is parsed as a STRING, not against PROPOSAL_STATES. The write
 * already happened; a value this build does not recognise is not a failed
 * write, and refusing it here would tell the person their entry was not made.
 * `writeOutcome` classifies it and the copy hedges on an unknown one.
 */
const seqOnly = object<{ seq: number }>({ seq: required(int) })
const statusOnly = object<{ status: string }>({ status: required(str) })
const seqAndStatus = object<{ seq: number; status: string }>({ seq: required(int), status: required(str) })

export type ProposalInput = Record<string, string | number | null | undefined>

export function usePropose() {
  const s = useSociety()
  return useWrite((proposal: ProposalInput) =>
    edge('/propose', { society: s.id, proposal }).then((r) => parse(seqAndStatus, r, '/propose')))
}

export function useCast() {
  const s = useSociety()
  return useWrite((a: { seq: number; decision: 'approve' | 'decline' }) =>
    edge('/cast', { society: s.id, ...a }).then((r) => parse(statusOnly, r, '/cast')))
}

export function useWithdraw() {
  const s = useSociety()
  return useWrite(async (seq: number) => unwrap(await supabase.rpc('api_withdraw', { p_society: s.id, p_seq: seq })))
}

export function useSignoff() {
  const s = useSociety()
  return useWrite((a: { month: string; note?: string }) => edge('/signoff', { society: s.id, ...a }).then((r) => parse(seqOnly, r, '/signoff')))
}

export function useCloseYear() {
  const s = useSociety()
  return useWrite((a: { fy: string; opinion: string; statement: string }) =>
    edge('/close-year', { society: s.id, ...a }).then((r) => parse(seqOnly, r, '/close-year')))
}

export function useRaiseFlag() {
  const s = useSociety()
  return useWrite(async (p: { scope: string; target_seqs?: number[]; counterparty?: string; period?: string; text: string }) =>
    unwrap(await supabase.rpc('api_raise_flag', { p_society: s.id, p })) as number)
}

export function useFlagNote() {
  const s = useSociety()
  return useWrite(async (a: { flag: number; note: string; text: string }) =>
    unwrap(await supabase.rpc('api_flag_note', { p_society: s.id, p_flag_seq: a.flag, p_note: a.note, p_text: a.text })))
}

export async function resolveHandle(society: string, handle: string) {
  return parse(
    resolvedHandle,
    unwrap(await supabase.rpc('api_resolve_handle', { p_society: society, p_handle: handle })),
    'resolveHandle',
  )
}

export async function previewCharge(society: string, flatSet: string, total: number) {
  return parse(
    chargePreview,
    unwrap(await supabase.rpc('api_preview_charge', { p_society: society, p_flat_set: flatSet, p_total: total })),
    'previewCharge',
  )
}

export function useAddResident() {
  const s = useSociety()
  return useWrite(async (a: { name: string; email: string; phone?: string; flat: string; kind: 'owner' | 'tenant' }) => {
    const person = unwrap(await supabase.rpc('api_add_person', {
      p_society: s.id, p_name: a.name, p_email: a.email, ...(a.phone ? { p_phone: a.phone } : {}) })) as string
    return unwrap(await supabase.rpc('api_add_tenure', { p_society: s.id, p_person: person, p_flat: a.flat, p_kind: a.kind }))
  })
}

export function useSummary() {
  const s = useSociety()
  return useQuery({
    queryKey: ['ledger', 'summary', s.id],
    queryFn: async () => parse(summary, unwrap(await supabase.rpc('api_summary', { p_society: s.id })), 'useSummary'),
  })
}

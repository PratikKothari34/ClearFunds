import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap, edge, bytea } from './supabase'
import { useMeStrict } from './session'
import { array, parse } from './parse'
import type { Parser } from './parse'
/*
 * `people` and `seats` are imported under pf-/sf- names because useCommittee
 * binds locals with those exact names. A shadowed parser is not a type error
 * - it silently resolves to the local array and parses nothing.
 */
import {
  chargePreview, disputeRow, duesRows, ledgerRow, limitEntries, people as peopleRows,
  proposalRow, report, resolvedHandle, seats as seatRows, signoffEntries, structurings,
  summary, years,
} from './rows'
import type { Entry } from './chain'

const PAGE = 1000

/**
 * Reads every row of a view in pages, in sequence order.
 *
 * Takes a PARSER, not a type argument. A type argument here was the widest
 * hole in the app: `all<LedgerRow>(...)` made the compiler vouch for the
 * shape of the entire ledger with nothing checking a single field at
 * runtime. Each page is parsed as it arrives, so a malformed row fails the
 * query at the page that contained it, naming the field.
 */
async function all<T>(
  view: 'ledger' | 'proposals' | 'disputes',
  rowParser: Parser<T>,
  society: string,
  order = 'seq',
): Promise<T[]> {
  const out: T[] = []
  const pageParser = array(rowParser)
  for (let from = 0; ; from += PAGE) {
    const raw = unwrap(
      await supabase.from(view).select('*').eq('society_id', society).order(order).range(from, from + PAGE - 1),
    )
    const rows = parse(pageParser, raw, `${view} rows ${from}-${from + PAGE - 1}`)
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
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
    queryFn: async () => {
      const seats = parse(
        seatRows,
        unwrap(
          await supabase.from('committee_seats').select('person_id,role,derived,seated_seq,unseated_seq')
            .eq('society_id', s.id).order('seated_seq'),
        ),
        'useCommittee seats',
      )
      const people = parse(
        peopleRows,
        unwrap(await supabase.from('people').select('id,full_name,email,phone').eq('society_id', s.id)),
        'useCommittee people',
      )
      return { seats, people }
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

export function useStructuring() {
  const s = useSociety()
  return useQuery({
    queryKey: ['structuring', s.id],
    queryFn: async () => parse(structurings, unwrap(await supabase.rpc('api_structuring', { p_society: s.id })), 'useStructuring'),
  })
}

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
            for (const k of ['ledger', 'proposals', 'disputes', 'dues', 'committee', 'years', 'report', 'structuring', 'signoffs', 'limit', 'head'])
              qc.invalidateQueries({ queryKey: [k] })
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

export type ProposalInput = Record<string, string | number | null | undefined>

export function usePropose() {
  const s = useSociety()
  return useWrite((proposal: ProposalInput) =>
    edge<{ seq: number; status: string }>('/propose', { society: s.id, proposal }))
}

export function useCast() {
  const s = useSociety()
  return useWrite((a: { seq: number; decision: 'approve' | 'decline' }) =>
    edge<{ status: string }>('/cast', { society: s.id, ...a }))
}

export function useWithdraw() {
  const s = useSociety()
  return useWrite(async (seq: number) => unwrap(await supabase.rpc('api_withdraw', { p_society: s.id, p_seq: seq })))
}

export function useSignoff() {
  const s = useSociety()
  return useWrite((a: { month: string; note?: string }) => edge<{ seq: number }>('/signoff', { society: s.id, ...a }))
}

export function useCloseYear() {
  const s = useSociety()
  return useWrite((a: { fy: string; opinion: string; statement: string }) =>
    edge<{ seq: number }>('/close-year', { society: s.id, ...a }))
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

export function useMarkSeen() {
  const s = useSociety()
  return useMutation({
    mutationFn: async (seq: number) => unwrap(await supabase.rpc('api_mark_seen', { p_society: s.id, p_seq: seq })),
  })
}

export function useSummary() {
  const s = useSociety()
  return useQuery({
    queryKey: ['ledger', 'summary', s.id],
    queryFn: async () => parse(summary, unwrap(await supabase.rpc('api_summary', { p_society: s.id })), 'useSummary'),
  })
}

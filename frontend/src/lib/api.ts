import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap, edge, bytea } from './supabase'
import { useMeStrict } from './session'
import type { Entry } from './chain'
import type {
  DisputeRow, DuesRow, LedgerRow, Person, ProposalRow, Report, Seat, Structuring, Year,
} from './types'

const PAGE = 1000

/** Reads every row of a view in pages, in sequence order. */
async function all<T>(view: 'ledger' | 'proposals' | 'disputes', society: string, order = 'seq'): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const rows = unwrap(
      await supabase.from(view).select('*').eq('society_id', society).order(order).range(from, from + PAGE - 1),
    ) as unknown as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

export function useSociety() {
  return useMeStrict().society
}

export function useLedger() {
  const s = useSociety()
  return useQuery({ queryKey: ['ledger', s.id], queryFn: () => all<LedgerRow>('ledger', s.id) })
}

export function useProposals() {
  const s = useSociety()
  return useQuery({ queryKey: ['proposals', s.id], queryFn: () => all<ProposalRow>('proposals', s.id) })
}

export function useDisputes() {
  const s = useSociety()
  return useQuery({ queryKey: ['disputes', s.id], queryFn: () => all<DisputeRow>('disputes', s.id) })
}

export function useTenantFlags() {
  const s = useSociety()
  return useQuery({
    queryKey: ['tenant-flags', s.id],
    queryFn: async () => new Set(unwrap(await supabase.rpc('api_my_tenant_flags', { p_society: s.id })) as number[]),
  })
}

export function useDues() {
  const s = useSociety()
  return useQuery({
    queryKey: ['dues', s.id],
    queryFn: async () =>
      unwrap(await supabase.from('flat_dues').select('*').eq('society_id', s.id).order('ordinal')) as unknown as DuesRow[],
  })
}

export function useCommittee() {
  const s = useSociety()
  return useQuery({
    queryKey: ['committee', s.id],
    queryFn: async () => {
      const seats = unwrap(
        await supabase.from('committee_seats').select('person_id,role,derived,seated_seq,unseated_seq')
          .eq('society_id', s.id).order('seated_seq'),
      ) as Seat[]
      const people = unwrap(
        await supabase.from('people').select('id,full_name,email,phone').eq('society_id', s.id),
      ) as Person[]
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
    queryFn: async () => unwrap(await supabase.rpc('api_years', { p_society: s.id })) as unknown as Year[],
  })
}

export function useReport(fy: string | undefined) {
  const s = useSociety()
  return useQuery({
    queryKey: ['report', s.id, fy],
    enabled: !!fy,
    queryFn: async () => unwrap(await supabase.rpc('api_report', { p_society: s.id, p_fy: fy! })) as unknown as Report,
  })
}

export function useStructuring() {
  const s = useSociety()
  return useQuery({
    queryKey: ['structuring', s.id],
    queryFn: async () => unwrap(await supabase.rpc('api_structuring', { p_society: s.id })) as unknown as Structuring[],
  })
}

export function useSignoffs() {
  const s = useSociety()
  return useQuery({
    queryKey: ['signoffs', s.id],
    queryFn: async () =>
      unwrap(
        await supabase.from('chain_entries').select('sequence,recorded_at,actor,body')
          .eq('society_id', s.id).eq('kind', 'month_signoff').order('sequence'),
      ) as unknown as { sequence: number; recorded_at: number; actor: string; body: { month: string; through_seq: number } }[],
  })
}

/** The limit in force, read from the chain like the server reads it. */
export function useLimit() {
  const s = useSociety()
  return useQuery({
    queryKey: ['limit', s.id],
    queryFn: async () => {
      const rows = unwrap(
        await supabase.from('chain_entries').select('sequence,kind,body,recorded_at').eq('society_id', s.id)
          .or('kind.eq.society_opened,and(kind.eq.posting,body->>effect.eq.limit)').order('sequence'),
      ) as unknown as { sequence: number; kind: string; recorded_at: number; body: Record<string, number> }[]
      const history = rows.map((r) => ({
        seq: r.sequence,
        recorded_at: r.recorded_at,
        limit_minor: (r.kind === 'society_opened' ? r.body.approval_limit_minor : r.body.limit_minor) ?? 0,
      }))
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
  return unwrap(await supabase.rpc('api_resolve_handle', { p_society: society, p_handle: handle })) as unknown as
    { name: string; flat: string; kind: string; ended: string | null } | null
}

export async function previewCharge(society: string, flatSet: string, total: number) {
  return unwrap(await supabase.rpc('api_preview_charge', { p_society: society, p_flat_set: flatSet, p_total: total })) as unknown as
    { flats: number; base_minor: number; extra_flats: number; remainder_labels: string[] } | null
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

export type Summary = {
  balance_minor: number
  entries: number
  head_seq: number
  as_of: number
  fy: string
  months: { month: string; in_minor: number; out_minor: number; charged_minor: number; entries: number }[]
  fy_spend: { category: string; amount_minor: number }[]
  fy_spend_total_minor: number
  outstanding_minor: number
  flats_outstanding: number
  flats: number
}

export function useSummary() {
  const s = useSociety()
  return useQuery({
    queryKey: ['ledger', 'summary', s.id],
    queryFn: async () => unwrap(await supabase.rpc('api_summary', { p_society: s.id })) as unknown as Summary,
  })
}

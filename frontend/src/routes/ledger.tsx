import { useDeferredValue, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { Plus, Search, SearchX } from 'lucide-react'
import { useDisputes, useLedger, useSummary } from '../lib/api'
import { useMeStrict, isCommittee } from '../lib/session'
import { categoryLabel, month } from '../lib/format'
import { Amount, Button, Empty, Facts, Failed, Input, Loading, PageTitle, Segmented } from '../components/ui'
import { EntryRow } from '../components/EntryRow'
import type { LedgerRow } from '../lib/types'

type Filter = 'all' | 'in' | 'out' | 'reversed' | 'disputed' | 'charges'

export const Route = createFileRoute('/ledger')({
  component: Ledger,
  validateSearch: (s: Record<string, unknown>): { f?: Filter | undefined; q?: string | undefined } => ({
    ...(typeof s.f === 'string' ? { f: s.f as Filter } : {}),
    ...(typeof s.q === 'string' ? { q: s.q } : {}),
  }),
})

/** Rows flagged by an open dispute, by entry or by payee. */
export function useDisputed() {
  const disputes = useDisputes()
  return useMemo(() => {
    const seqs = new Set<number>()
    const payees = new Set<string>()
    for (const d of disputes.data ?? []) {
      if (!d.is_open) continue
      for (const s of d.target_seqs) seqs.add(s)
      if (d.counterparty) payees.add(d.counterparty.toLowerCase())
    }
    return (r: LedgerRow) => seqs.has(r.seq) || (!!r.counterparty && payees.has(r.counterparty.toLowerCase()))
  }, [disputes.data])
}

function match(r: LedgerRow, q: string) {
  if (!q) return true
  if (/^#\d+$/.test(q)) return r.seq === Number(q.slice(1))
  const hay = `${r.counterparty ?? ''} ${r.narration} ${categoryLabel(r.category)} ${r.reason ?? ''}`.toLowerCase()
  const digits = q.replace(/[,₹\s]/g, '')
  return hay.includes(q) || (/^\d+$/.test(digits) && String(Math.abs(r.amount_minor)).startsWith(digits))
}

function Ledger() {
  const me = useMeStrict()
  const search = Route.useSearch()
  const nav = Route.useNavigate()
  const filter = search.f ?? 'all'
  const [q, setQ] = useState(search.q ?? '')
  const dq = useDeferredValue(q.trim().toLowerCase())
  const ledger = useLedger()
  const summary = useSummary()
  const disputed = useDisputed()

  const rows = useMemo(() => {
    const all = (ledger.data ?? []).toReversed()
    return all.filter((r) => {
      if (!match(r, dq)) return false
      switch (filter) {
        case 'in': return r.is_cash && r.amount_minor > 0
        case 'out': return r.is_cash && r.amount_minor < 0
        case 'reversed': return r.reversed_by_seq !== null || r.reverses_seq !== null
        case 'disputed': return disputed(r)
        case 'charges': return !r.is_cash
        default: return true
      }
    })
  }, [ledger.data, dq, filter, disputed])

  // Month headers interleaved with rows, so the list virtualises as one.
  const items = useMemo(() => {
    const out: ({ k: 'm'; month: string } | { k: 'r'; r: LedgerRow })[] = []
    let cur = ''
    for (const r of rows) {
      const m = r.business_date.slice(0, 7)
      if (m !== cur) { out.push({ k: 'm', month: m }); cur = m }
      out.push({ k: 'r', r })
    }
    return out
  }, [rows])

  const months = useMemo(() => new Map((summary.data?.months ?? []).map((m) => [m.month, m])), [summary.data])

  const v = useWindowVirtualizer({
    count: items.length,
    estimateSize: (i) => (items[i]!.k === 'm' ? 52 : 68),
    overscan: 12,
  })

  return (
    <div>
      <PageTitle
        title="Ledger"
        sub={ledger.data ? `${ledger.data.length.toLocaleString('en-IN')} entries, oldest kept forever` : ' '}
        action={isCommittee(me) && <Link to="/new"><Button tone="primary" icon={<Plus className="size-4" />}>New</Button></Link>}
      />

      <div className="sticky top-14 z-20 -mx-4 space-y-3 bg-bg/90 px-4 pt-1 pb-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:top-0">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink-2" />
          <Input
            type="search" value={q} aria-label="Search the ledger"
            onChange={(e) => { setQ(e.target.value); nav({ search: (s) => ({ ...s, q: e.target.value || undefined }), replace: true }) }}
            placeholder="Payee, amount, or #entry" className="pl-10"
          />
        </div>
        <Segmented<Filter>
          label="Filter entries" value={filter}
          onChange={(f) => nav({ search: (s) => ({ ...s, f: f === 'all' ? undefined : f }), replace: true })}
          options={[
            { value: 'all', label: 'All' }, { value: 'in', label: 'In' }, { value: 'out', label: 'Out' },
            { value: 'charges', label: 'Charges' }, { value: 'reversed', label: 'Reversed' }, { value: 'disputed', label: 'Disputed' },
          ]}
        />
      </div>

      {ledger.isPending ? <Loading rows={6} />
        : ledger.isError ? <Failed error={ledger.error} retry={() => ledger.refetch()} />
        : !rows.length ? <Empty icon={<SearchX className="size-5" />} title="No entries match">Try another word, or clear the filter.</Empty>
        : (
          <div className="relative" style={{ height: v.getTotalSize() }}>
            {v.getVirtualItems().map((vi) => {
              const it = items[vi.index]!
              return (
                <div key={vi.key} data-index={vi.index} ref={v.measureElement}
                  className="absolute inset-x-0" style={{ transform: `translateY(${vi.start - v.options.scrollMargin}px)` }}>
                  {it.k === 'm' ? (
                    <div className="flex items-end justify-between gap-3 px-3 pt-5 pb-1.5">
                      <h2 className="text-sm font-semibold">{month(it.month)}</h2>
                      {months.get(it.month) && (
                        <span className="text-xs text-ink-2">
                          <Facts items={[
                            <span key="i">In <Amount minor={months.get(it.month)!.in_minor} size="sm" className="text-xs text-credit" /></span>,
                            <span key="o">Out <Amount minor={months.get(it.month)!.out_minor} size="sm" className="text-xs text-debit" /></span>,
                          ]} />
                        </span>
                      )}
                    </div>
                  ) : <EntryRow r={it.r} flagged={disputed(it.r)} />}
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

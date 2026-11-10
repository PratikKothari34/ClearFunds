import { useDeferredValue, useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { Plus, Search, SearchX } from 'lucide-react'
import { useDisputes, useLedger, useSummary } from '../lib/api'
import { useMeStrict, isCommittee } from '../lib/session'
import { month, monthOf } from '../lib/format'
import { countable, owing } from '../lib/countable'
import { monthHasReversal as monthReversal } from '../lib/reversed'
import { match } from '../lib/search'
import { disputeState, type DisputeState } from '../lib/disputed'
import { Amount, Button, Empty, Facts, Failed, Input, Loading, PageTitle, Segmented } from '../components/ui'
import { EntryRow } from '../components/EntryRow'
import type { LedgerRow } from '../lib/types'

const FILTERS = ['all', 'in', 'out', 'reversed', 'disputed', 'charges'] as const
type Filter = (typeof FILTERS)[number]

export const Route = createFileRoute('/ledger')({
  component: Ledger,
  validateSearch: (s: Record<string, unknown>): { f?: Filter | undefined; q?: string | undefined } => ({
    /*
     * CHECKED, not cast. `f` comes from the address bar, so `s.f as Filter`
     * let any string through as a Filter. The switch below defaults to
     * showing every row, which is safe - but the same value also drives
     * `Segmented`, a role="tablist" that marks the matching tab
     * aria-selected. An unknown filter leaves EVERY tab aria-selected=false:
     * invalid ARIA, and a screen reader then announces no current filter
     * while the list silently shows everything. Dropping the value falls
     * back to 'all', which is what the list was already doing.
     */
    ...(FILTERS.includes(s.f as Filter) ? { f: s.f as Filter } : {}),
    ...(typeof s.q === 'string' ? { q: s.q } : {}),
  }),
})

/**
 * Rows flagged by an open dispute, by entry or by payee - and whether that
 * question could be answered at all.
 *
 * Both rules live in lib/, where they are tested without a router: the match
 * itself is `disputedBy`, and `disputeState` is what decides whether a
 * missing flag means "not disputed" or "we could not check". This hook is
 * only the subscription and the memo.
 */
export function useDisputed(): DisputeState {
  const disputes = useDisputes()
  return useMemo(
    () => disputeState({ data: disputes.data, isPending: disputes.isPending, isError: disputes.isError }),
    [disputes.data, disputes.isPending, disputes.isError],
  )
}

function Ledger() {
  const me = useMeStrict()
  const search = Route.useSearch()
  const nav = Route.useNavigate()
  const filter = search.f ?? 'all'
  const [q, setQ] = useState(search.q ?? '')
  const dq = useDeferredValue(q)
  const ledger = useLedger()
  const summary = useSummary()
  const disputed = useDisputed()

  const rows = useMemo(() => {
    const all = (ledger.data ?? []).toReversed()
    return all.filter((r) => {
      if (!match(r, dq)) return false
      switch (filter) {
        /*
         * An unreadable amount has no direction, so it cannot be claimed by
         * either side - but it must not vanish from the ledger entirely, and
         * it does not: 'all' keeps it, which is the default view. Deciding
         * in/out from a null here is what hid a flat on the dues screen.
         */
        case 'in': return r.is_cash && owing(r.amount_minor)
        case 'out': { const a = countable(r.amount_minor); return r.is_cash && a.readable && a.minor < 0 }
        case 'reversed': return r.reversed_by_seq !== null || r.reverses_seq !== null
        case 'disputed': return disputed.is(r)
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
      const m = monthOf(r.business_date)
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

      {/*
        * How many entries the filter left, for someone who cannot see the
        * list change. Filtering from forty rows to none, or back, is silent
        * otherwise: a screen-reader user cannot tell "nothing matches" from
        * "still loading" from "the filter did not apply". The visible
        * answer is the rows themselves, so this is `sr-only`.
        *
        * Rendered ALWAYS, with the TEXT conditional - the same rule the
        * statement counter needed. A region created at the moment it first
        * has something to say may never announce that first message, and
        * here the first message is the one that matters most: the search
        * that found nothing.
        *
        * Silent while pending, because "0 entries" during a load is a wrong
        * answer, not a slow one. `Loading` already carries its own
        * role="status".
        */}
      <p className="sr-only" aria-live="polite">
        {ledger.isPending || ledger.isError
          ? ''
          : rows.length === 1
            ? '1 entry'
            : `${rows.length.toLocaleString('en-IN')} entries`}
      </p>

      {ledger.isPending ? <Loading rows={6} />
        : ledger.isError ? <Failed error={ledger.error} retry={() => ledger.refetch()} />
        /*
         * The DISPUTES read gets its own arms, before the empty one, and only
         * under the filter that depends on it. An empty state is a claim:
         * "No entries match - try another word" tells a resident that nothing
         * in the society is contested, which is a statement about money this
         * screen cannot make when the dispute list did not arrive. Same
         * ordering rule as the ledger's own arms above - error before empty.
         *
         * Scoped to `filter === 'disputed'` deliberately: under every other
         * filter the rows themselves are readable and correct, so blocking
         * the whole ledger on a failed dispute read would hide the history to
         * avoid overstating the flags. The flag's own disclosure is on the
         * row, below.
         */
        : filter === 'disputed' && disputed.kind === 'pending' ? <Loading rows={6} />
        : filter === 'disputed' && disputed.kind === 'unknown' ? (
          <Empty icon={<SearchX className="size-5" />} title="Disputes could not be loaded">
            This list is not saying there are none - the dispute list did not load, so it cannot be shown. The entries themselves are unaffected.
          </Empty>
        )
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
                            /*
                             * Both figures above carry reversals gross, so
                             * this says when part of them is a correction
                             * rather than money that moved. One fact for the
                             * month, not one per side: this header is a
                             * virtualized item whose height is measured, and
                             * a block disclosure under each figure would both
                             * break the row and remeasure it. The per-side
                             * split is on the dashboard, which has the room.
                             *
                             * `monthReversal` is what decides; a reader who
                             * sees nothing here is being told the month holds
                             * no reversals, which is why 'unknown' renders a
                             * phrase instead of nothing.
                             */
                            ...(monthReversal(months.get(it.month)!) === 'none' ? [] : [
                              <span key="r">{monthReversal(months.get(it.month)!) === 'unknown'
                                ? 'may include corrections'
                                : 'includes corrections'}</span>,
                            ]),
                          ]} />
                        </span>
                      )}
                    </div>
                  ) : <EntryRow r={it.r} flagged={disputed.kind === 'ready' ? disputed.is(it.r) : 'unknown'} />}
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

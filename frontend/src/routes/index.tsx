import { useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, CheckCheck, Flag, Gavel, PenLine, Plus, Wallet, Sparkles } from 'lucide-react'
import { useDisputes, useDues, useLedger, useNames, useProposals, useSignoffs, useSummary, useTenantFlags, useYears } from '../lib/api'
import { useMeStrict, isCommittee } from '../lib/session'
import { categoryLabel, instant, month, plural, proposalTitle, todayIST } from '../lib/format'
import { Amount, Button, Caption, Card, Facts, Skeleton, cx } from '../components/ui'
import { EntryRow } from '../components/EntryRow'
import { Provenance } from '../components/Provenance'
import { recentMonths, waitsOn } from '../components/Shell'
import type { Me } from '../lib/types'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const me = useMeStrict()
  const summary = useSummary()
  const ledger = useLedger()
  const s = summary.data
  const cur = todayIST().slice(0, 7)
  const thisMonth = s?.months.find((m) => m.month === cur)
  const recent = useMemo(() => (ledger.data ?? []).slice(-5).toReversed(), [ledger.data])

  return (
    <div className="space-y-6">
      {/* The balance and its provenance are one block: the figure and the reason to trust it. */}
      <Card className="rise overflow-hidden">
        <div className="px-5 pt-5 pb-6">
          <p className="text-[13px] font-medium text-ink-2">Society balance</p>
          <div className="mt-3 min-h-14">
            {s ? <Amount minor={s.balance_minor} size="hero" /> : <Skeleton className="h-14 w-64" />}
          </div>
          <p className="mt-3 text-[13px] text-ink-2">
            {s ? <Facts items={[`as of ${instant(s.as_of)}`, plural(s.entries, 'entry', 'entries')]} /> : <>&nbsp;</>}
          </p>
        </div>
        <div className="border-t border-line">
          <Provenance society={me.society.id} />
        </div>
      </Card>

      <NeedsYou me={me} />

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <Caption>{month(cur, { month: 'long' })} so far</Caption>
          <Card className="p-5">
            {thisMonth ? <InOut inMinor={thisMonth.in_minor} outMinor={thisMonth.out_minor} /> : s ? <p className="text-sm text-ink-2">No money moved yet this month.</p> : <Skeleton className="h-20" />}
          </Card>
        </section>
        <section>
          <Caption>Spent this year, {s?.fy}</Caption>
          <Card className="p-5">
            {s ? <Spend items={s.fy_spend} total={s.fy_spend_total_minor} /> : <Skeleton className="h-20" />}
          </Card>
        </section>
      </div>

      <section>
        <Caption action={<Link to="/ledger" className="inline-flex items-center gap-1 text-sm font-medium text-accent">All entries <ArrowRight className="size-3.5" /></Link>}>
          Latest
        </Caption>
        <Card className="p-1.5">
          {ledger.isPending ? <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            : recent.length ? recent.map((r) => <EntryRow key={r.seq} r={r} />)
            : <p className="p-5 text-sm text-ink-2">No entries yet.</p>}
        </Card>
      </section>
    </div>
  )
}

function InOut({ inMinor, outMinor }: { inMinor: number; outMinor: number }) {
  const total = inMinor + outMinor || 1
  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[13px] text-ink-2">In</p>
          <Amount minor={inMinor} size="lg" className="text-credit" />
        </div>
        <div>
          <p className="text-[13px] text-ink-2">Out</p>
          <Amount minor={outMinor} size="lg" className="text-debit" />
        </div>
      </div>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <span className="bg-credit" style={{ width: `${(inMinor / total) * 100}%` }} />
        <span className="ml-0.5 bg-debit" style={{ width: `${(outMinor / total) * 100}%` }} />
      </div>
    </div>
  )
}

function Spend({ items, total }: { items: { category: string; amount_minor: number }[]; total: number }) {
  if (!items.length) return <p className="text-sm text-ink-2">Nothing spent yet this year.</p>
  const top = items.slice(0, 4)
  const max = top[0]!.amount_minor || 1
  return (
    <div className="space-y-2.5">
      {top.map((c) => (
        <div key={c.category}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>{categoryLabel(c.category)}</span>
            <Amount minor={c.amount_minor} size="sm" className="text-ink-2" />
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-sunken" aria-hidden>
            <div className="h-full rounded-full bg-ink/70" style={{ width: `${(c.amount_minor / max) * 100}%` }} />
          </div>
        </div>
      ))}
      <p className="pt-1 text-right text-[13px] text-ink-2">Total <Amount minor={total} size="sm" /></p>
    </div>
  )
}

type Item = { key: string; icon: typeof Flag; title: string; sub: string; to: string; params?: Record<string, string> }

/**
 * Amber means this viewer must act. The slot is always reserved so nothing
 * below it moves; with nothing pending it says so quietly, without amber.
 */
function NeedsYou({ me }: { me: Me }) {
  const proposals = useProposals()
  const signoffs = useSignoffs()
  const years = useYears()
  const disputes = useDisputes()
  const tenantFlags = useTenantFlags()
  const dues = useDues()
  const names = useNames()

  const items: Item[] = []
  if (isCommittee(me)) {
    const mine = (proposals.data ?? []).filter((p) => waitsOn(p, me))
    for (const p of mine.slice(0, 3)) {
      items.push({ key: `p${p.seq}`, icon: CheckCheck, title: `Approve: ${proposalTitle(p, names)}`,
        sub: `${p.approve_count} of ${p.required} so far`, to: '/approvals' })
    }
    if (mine.length > 3) items.push({ key: 'pmore', icon: CheckCheck, title: `${mine.length - 3} more waiting for your approval`, sub: 'Approvals', to: '/approvals' })
  }
  if (me.seat?.role === 'president' && signoffs.data) {
    const done = new Set(signoffs.data.map((s) => s.body.month))
    const cur = todayIST().slice(0, 7)
    for (const m of recentMonths(cur, 3).filter((m) => m < cur && !done.has(m))) {
      items.push({ key: `s${m}`, icon: PenLine, title: `Sign off ${month(m)}`, sub: 'The month’s expense sheet', to: '/sign-off' })
    }
  }
  for (const y of years.data ?? []) {
    if (me.auditor_for.includes(y.fy) && y.ended && !y.closed) {
      items.push({ key: `y${y.fy}`, icon: Gavel, title: `Close FY ${y.fy}`, sub: 'Give your opinion and seal the year', to: '/year-end' })
    }
  }
  if (me.tenure) {
    const own = (dues.data ?? []).find((d) => d.flat_id === me.tenure!.flat_id)
    if (own && own.outstanding_minor > 0) {
      items.push({ key: 'dues', icon: Wallet, title: `Flat ${own.label} owes`, sub: 'Maintenance outstanding', to: '/my-flat' })
    }
    for (const d of disputes.data ?? []) {
      const mine = d.handle === me.tenure.handle
      if (mine && d.is_open && d.notes.some((n) => n.note === 'response' && !d.notes.some((x) => x.by_author && x.seq > n.seq))) {
        items.push({ key: `d${d.seq}`, icon: Flag, title: 'The committee replied to your dispute', sub: d.text, to: '/disputes' })
      }
      if (!mine && tenantFlags.data?.has(d.seq) && d.is_open) {
        items.push({ key: `t${d.seq}`, icon: Flag, title: 'Your tenant raised a dispute', sub: d.text, to: '/disputes' })
      }
    }
  }

  return (
    <section aria-label="What needs you">
      <Caption action={isCommittee(me) && (
        <Link to="/new"><Button size="sm" tone="quiet" icon={<Plus className="size-4" />}>New entry</Button></Link>
      )}>
        Needs you
      </Caption>
      {items.length ? (
        <Card className="overflow-hidden border-attention/25">
          <ul className="divide-y divide-line">
            {items.map((it) => (
              <li key={it.key}>
                <Link to={it.to} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-attention-soft/60">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-attention-soft text-attention"><it.icon className="size-[18px]" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{it.title}</span>
                    <span className="block truncate text-[13px] text-ink-2">{it.sub}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-attention" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className={cx('flex items-center gap-3 px-4 py-4 text-ink-2')}>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sunken"><Sparkles className="size-[18px]" /></span>
          <span className="text-sm">Nothing needs you right now.</span>
        </Card>
      )}
    </section>
  )
}

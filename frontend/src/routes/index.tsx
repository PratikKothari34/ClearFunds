import { useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, CheckCheck, Flag, Gavel, Hourglass, PenLine, Plus, Wallet, Sparkles } from 'lucide-react'
import { useDisputes, useDues, useLedger, useNames, useProposals, useSignoffs, useSummary, useTenantFlags, useYears } from '../lib/api'
import { useMeStrict, isCommittee, useCurrency } from '../lib/session'
import { owing } from '../lib/countable'
import { reversedIn, reversedOut } from '../lib/reversed'
import { derivedRead, listReadMap } from '../lib/listread'
import { barPercent, spendView } from '../lib/spend'
import { categoryLabel, instant, month, monthOf, plural, proposalTitle, todayIST } from '../lib/format'
import { Amount, Button, Caption, Card, Facts, ReversedNote, Skeleton, cx } from '../components/ui'
import { EntryRow } from '../components/EntryRow'
import { Provenance } from '../components/Provenance'
import { recentMonths, waitsOn } from '../components/Shell'
import type { Me, Summary } from '../lib/types'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const ccy = useCurrency()
  const me = useMeStrict()
  const summary = useSummary()
  const ledger = useLedger()
  const s = summary.data
  const cur = monthOf(todayIST())
  const thisMonth = s?.months.find((m) => m.month === cur)
  /* "No entries yet." claims this society has never recorded anything. It was
   * rendered from `(ledger.data ?? [])` behind a pending-only arm, so a
   * failed read said it on the first screen anyone sees. */
  const recentRead = useMemo(
    () => listReadMap(ledger, (rows) => rows.slice(-5).toReversed()),
    [ledger.data, ledger.isPending, ledger.isError],
  )
  const recent = recentRead.kind === 'ready' ? recentRead.rows : []

  return (
    <div className="space-y-6">
      {/* The balance and its provenance are one block: the figure and the reason to trust it. */}
      <Card className="rise overflow-hidden">
        <div className="px-5 pt-5 pb-6">
          <p className="text-[13px] font-medium text-ink-2">Society balance</p>
          <div className="mt-3 min-h-14">
            {s ? <Amount currency={ccy} minor={s.balance_minor} size="hero" /> : <Skeleton className="h-14 w-64" />}
          </div>
          <p className="mt-3 text-[13px] text-ink-2">
            {/*
              * "entries" ALONE IS AMBIGUOUS ACROSS TWO SCREENS.
              *
              * This figure is `public.ledger`: money postings only, 989 on the
              * seeded society. `/verify` counts every chain record - approvals,
              * appointments, flags, resolutions, opinions - and reported
              * "4,254 entries checked". Both were right and both said
              * "entries", so a resident comparing them reads the chain as
              * covering 3,265 records the ledger is hiding. That is the
              * opposite of what verification is for, and the reader who does
              * the most work to check is the one most misled.
              *
              * The noun is the fix: this card sits under the society balance,
              * so what it counts is the postings that produced it.
              */}
            {s ? <Facts items={[`as of ${instant(s.as_of)}`, plural(s.entries, 'money entry', 'money entries')]} /> : <>&nbsp;</>}
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
            {/* `s ? claim : <Skeleton>` was both defects at once: a failed
              * summary read said no money had moved this month, and a failed
              * read with no month row shimmered forever. */}
            {thisMonth ? <InOut month={thisMonth} />
              : summary.isError ? <p className="text-sm text-ink-2">This month’s figures could not be loaded.</p>
              : s ? <p className="text-sm text-ink-2">No money moved yet this month.</p>
              : <Skeleton className="h-20" />}
          </Card>
        </section>
        <section>
          <Caption>Spent this year, {s?.fy}</Caption>
          <Card className="p-5">
            {s ? <Spend items={s.fy_spend} total={s.fy_spend_total_minor} />
              : summary.isError ? <p className="text-sm text-ink-2">This year’s figures could not be loaded.</p>
              : <Skeleton className="h-20" />}
          </Card>
        </section>
      </div>

      <section>
        <Caption action={<Link to="/ledger" className="inline-flex items-center gap-1 text-sm font-medium text-accent">All entries <ArrowRight className="size-3.5" /></Link>}>
          Latest
        </Caption>
        <Card className="p-1.5">
          {recentRead.kind === 'pending' ? <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            : recentRead.kind === 'unknown' ? <p className="p-5 text-sm text-ink-2">The entries could not be loaded, so this is not saying there are none.</p>
            : recent.length ? recent.map((r) => <EntryRow key={r.seq} r={r} />)
            : <p className="p-5 text-sm text-ink-2">No entries yet.</p>}
        </Card>
      </section>
    </div>
  )
}

/*
 * The resident's first sight of the month, and the figure most open to being
 * misread: both sides carry reversals GROSS, so a reversed Rs 9,000 expense
 * reads as Rs 9,000 "In" though nobody paid the society anything.
 *
 * The figures are not touched - the server computed them and in less out has
 * to equal the balance. What is added is the sentence saying how much of each
 * side is a correction, so the number can be read correctly.
 *
 * The proportion bar is left computing on the posted figures on purpose. It
 * shows the shape of what was POSTED, which is what the two amounts above it
 * say, and recomputing it on a netted figure would make the bar disagree with
 * the figures beside it - and would be money arithmetic in the client. It is
 * `aria-hidden` decoration; the disclosure below carries the meaning.
 */
function InOut({ month }: { month: Summary['months'][number] }) {
  const ccy = useCurrency()
  const total = month.in_minor + month.out_minor || 1
  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[13px] text-ink-2">In</p>
          <Amount currency={ccy} minor={month.in_minor} size="lg" className="text-credit" />
          <ReversedNote currency={ccy} of={reversedIn(month)} className="mt-1" />
        </div>
        <div>
          <p className="text-[13px] text-ink-2">Out</p>
          <Amount currency={ccy} minor={month.out_minor} size="lg" className="text-debit" />
          <ReversedNote currency={ccy} of={reversedOut(month)} className="mt-1" />
        </div>
      </div>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <span className="bg-credit" style={{ width: `${(month.in_minor / total) * 100}%` }} />
        <span className="ml-0.5 bg-debit" style={{ width: `${(month.out_minor / total) * 100}%` }} />
      </div>
    </div>
  )
}

/*
 * The rows and the figure under them have to agree, and `spendView` decides
 * whether they do - see `lib/spend.ts`. The card has room for four categories,
 * so on a society with more it prints a figure covering rows it is not
 * showing; it says so instead of calling that figure a plain "Total".
 */
const SPEND_ROWS = 4

function Spend({ items, total }: { items: { category: string; amount_minor: number }[]; total: number }) {
  const ccy = useCurrency()
  if (!items.length) return <p className="text-sm text-ink-2">Nothing spent yet this year.</p>
  const v = spendView(items, total, SPEND_ROWS)
  return (
    <div className="space-y-2.5">
      {v.shown.map((c) => {
        const width = barPercent(c.amount_minor, v.scale)
        return (
          <div key={c.category}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{categoryLabel(c.category)}</span>
              <Amount currency={ccy} minor={c.amount_minor} size="sm" className="text-ink-2" />
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-sunken" aria-hidden>
              {width === null ? null : <div className="h-full rounded-full bg-ink/70" style={{ width: `${width}%` }} />}
            </div>
          </div>
        )
      })}
      {v.covers === 'all' ? (
        <p className="pt-1 text-right text-[13px] text-ink-2">Total <Amount currency={ccy} minor={v.allTotal} size="sm" /></p>
      ) : (
        <div className="pt-1 text-right text-[13px] text-ink-2">
          <p>
            {v.hidden > 0 ? `Total, all ${v.shown.length + v.hidden} categories ` : 'Total, whole year '}
            <Amount currency={ccy} minor={v.allTotal} size="sm" />
          </p>
          {v.hidden > 0 ? (
            <p className="text-ink-2">
              {v.hidden === 1 ? '1 smaller category is' : `${v.hidden} smaller categories are`} not shown above.
            </p>
          ) : null}
        </div>
      )}
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

  /*
   * Every read this VIEWER's obligations actually depend on, collected in the
   * same role branches that consume them - so a resident is not held back by
   * a proposals read they have no stake in, and a treasurer is not told the
   * set is complete when the proposals read failed.
   *
   * "Nothing needs you right now." was rendered from `items.length` alone,
   * over six reads all coalesced with `?? []` or `?.`. A treasurer with
   * approvals waiting, on a dropped connection, was told there was nothing to
   * do - the same defect as the nav badge, still live on the card the badge
   * points at.
   */
  const relied: Array<{ isPending: boolean; isError: boolean }> = []

  const items: Item[] = []
  if (isCommittee(me)) {
    relied.push(proposals)
    const mine = (proposals.data ?? []).filter((p) => waitsOn(p, me))
    for (const p of mine.slice(0, 3)) {
      items.push({ key: `p${p.seq}`, icon: CheckCheck, title: `Approve: ${proposalTitle(p, names)}`,
        sub: `${p.approve_count} of ${p.required} so far`, to: '/approvals' })
    }
    if (mine.length > 3) items.push({ key: 'pmore', icon: CheckCheck, title: `${mine.length - 3} more waiting for your approval`, sub: 'Approvals', to: '/approvals' })
  }
  if (me.seat?.role === 'president') relied.push(signoffs)
  if (me.seat?.role === 'president' && signoffs.data) {
    const done = new Set(signoffs.data.map((s) => s.body.month))
    const cur = monthOf(todayIST())
    for (const m of recentMonths(cur, 3).filter((r) => r < cur && !done.has(r))) {
      items.push({ key: `s${m}`, icon: PenLine, title: `Sign off ${month(m)}`, sub: 'The month’s expense sheet', to: '/sign-off' })
    }
  }
  if (me.auditor_for.length) relied.push(years)
  for (const y of years.data ?? []) {
    if (me.auditor_for.includes(y.fy) && y.ended && !y.closed) {
      items.push({ key: `y${y.fy}`, icon: Gavel, title: `Close FY ${y.fy}`, sub: 'Give your opinion and seal the year', to: '/year-end' })
    }
  }
  if (me.tenure) {
    relied.push(dues, disputes, tenantFlags)
    const own = (dues.data ?? []).find((d) => d.flat_id === me.tenure!.flat_id)
    /*
     * `owing()` is false for an unreadable amount, so a resident is not told
     * their flat owes money on the strength of a figure nobody could read.
     * The dues screen discloses it instead, which is where the detail lives.
     */
    if (own && owing(own.outstanding_minor)) {
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

  const waiting = derivedRead(items, relied)

  return (
    <section aria-label="What needs you">
      <Caption action={isCommittee(me) && (
        <Link to="/new"><Button tone="quiet" icon={<Plus className="size-4" />}>New entry</Button></Link>
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
        /*
         * The quiet sentence is a CLAIM, so it is earned only by reads that
         * all arrived. Pending and failed get the same reserved slot - the
         * layout below must not move - with wording that does not discharge
         * the viewer of an obligation nobody could count.
         */
        <Card className={cx('flex items-center gap-3 px-4 py-4 text-ink-2')}>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sunken">
            {waiting.kind === 'ready' ? <Sparkles className="size-[18px]" /> : <Hourglass className="size-[18px]" />}
          </span>
          <span className="text-sm">
            {waiting.kind === 'pending' ? 'Checking what needs you…'
              : waiting.kind === 'unknown' ? 'What needs you could not be loaded, so this is not saying there is nothing.'
              : 'Nothing needs you right now.'}
          </span>
        </Card>
      )}
    </section>
  )
}

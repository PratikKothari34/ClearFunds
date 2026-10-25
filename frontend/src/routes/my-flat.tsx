import { createFileRoute, Link } from '@tanstack/react-router'
import { Check, Eye } from 'lucide-react'
import { useDues, useLedger } from '../lib/api'
import { useMeStrict } from '../lib/session'
import { longDay } from '../lib/format'
import { Amount, Card, Caption, Empty, EntryIcon, Loading, PageTitle, cx } from '../components/ui'

export const Route = createFileRoute('/my-flat')({ component: MyFlat })

function MyFlat() {
  const me = useMeStrict()
  const dues = useDues()
  const ledger = useLedger()
  if (!me.tenure) return <Empty icon={<Eye className="size-5" />} title="No flat on your account" />
  const d = dues.data?.find((x) => x.flat_id === me.tenure!.flat_id)
  const mine = (ledger.data ?? []).filter((r) => r.flat_id === me.tenure!.flat_id).toReversed()
  const owes = (d?.outstanding_minor ?? 0) > 0

  return (
    <div>
      <PageTitle title={`Flat ${me.tenure.flat}`} sub={me.tenure.kind === 'tenant' ? 'You are a tenant here.' : 'Your maintenance account.'} />
      {!d ? <Loading rows={2} /> : (
        <Card className={cx('rise p-5', owes ? 'border-debit/25' : '')}>
          <p className="text-[13px] font-medium text-ink-2">{owes ? 'Outstanding' : 'Settled'}</p>
          <div className="mt-2 flex items-center gap-3">
            {owes ? <Amount minor={d.outstanding_minor} size="hero" className="text-debit" />
              : <span className="flex items-center gap-3 text-4xl font-semibold tracking-tight"><span className="grid size-11 place-items-center rounded-full bg-credit-soft"><Check className="size-6 text-credit" strokeWidth={3} /></span>Nothing due</span>}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-sunken p-3"><p className="text-ink-2">Charged to date</p><Amount minor={d.charged_minor} className="mt-0.5 block" /></div>
            <div className="rounded-xl bg-sunken p-3"><p className="text-ink-2">Paid to date</p><Amount minor={d.paid_minor} className="mt-0.5 block" /></div>
          </div>
          {owes && <p className="mt-4 text-[13px] text-ink-2">Pay the society’s bank account. The treasurer records it, and it shows here once approved.</p>}
        </Card>
      )}

      <Caption className="mt-6">Payments from this flat</Caption>
      <Card className="p-1.5">
        {ledger.isPending ? <Loading rows={3} /> : mine.length ? mine.map((r) => (
          <Link key={r.seq} to="/entry/$seq" params={{ seq: String(r.seq) }} className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-sunken">
            <EntryIcon category={r.category} effect={r.effect} />
            <span className="min-w-0 flex-1">
              <span className={cx('block truncate font-medium', r.reversed_by_seq !== null && 'line-through text-ink-2')}>{r.narration}</span>
              <span className="block text-[13px] text-ink-2">{longDay(r.business_date)}</span>
            </span>
            <Amount minor={r.amount_minor} signed tone="auto" struck={!!r.reversed_by_seq} />
          </Link>
        )) : <p className="p-4 text-sm text-ink-2">No payments recorded yet.</p>}
      </Card>
    </div>
  )
}

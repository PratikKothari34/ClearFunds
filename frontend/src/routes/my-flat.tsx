import { createFileRoute, Link } from '@tanstack/react-router'
import { Check, Eye } from 'lucide-react'
import { useDues, useLedger } from '../lib/api'
import { useMeStrict } from '../lib/session'
import { longDay } from '../lib/format'
import { countable } from '../lib/countable'
import { Amount, Card, Caption, Empty, EntryIcon, Loading, PageTitle, cx } from '../components/ui'

export const Route = createFileRoute('/my-flat')({ component: MyFlat })

function MyFlat() {
  const me = useMeStrict()
  const dues = useDues()
  const ledger = useLedger()
  if (!me.tenure) return <Empty icon={<Eye className="size-5" />} title="No flat on your account" />
  const d = dues.data?.find((x) => x.flat_id === me.tenure!.flat_id)
  const mine = (ledger.data ?? []).filter((r) => r.flat_id === me.tenure!.flat_id).toReversed()
  /*
     * This typechecked before and was still wrong: `(x ?? 0) > 0` is false
     * for a figure that could not be read, so a resident whose arrears were
     * unreadable got the green tick and the words "Nothing due" - the
     * strongest claim on the screen, made from no data. Three states.
     */
  const owed = countable(d?.outstanding_minor)
  const owes = owed.readable && owed.owing
  const unknown = Boolean(d) && !owed.readable

  return (
    <div>
      <PageTitle title={`Flat ${me.tenure.flat}`} sub={me.tenure.kind === 'tenant' ? 'You are a tenant here.' : 'Your maintenance account.'} />
      {!d ? <Loading rows={2} /> : (
        <Card className={cx('rise p-5', owes ? 'border-debit/25' : '')}>
          <p className="text-[13px] font-medium text-ink-2">{unknown ? 'Not available' : owes ? 'Outstanding' : 'Settled'}</p>
          <div className="mt-2 flex items-center gap-3">
            {unknown ? <span className="text-2xl font-semibold tracking-tight text-ink-2">Could not be read</span>
              : owes ? <Amount minor={owed.minor} size="hero" className="text-debit" />
              : <span className="flex items-center gap-3 text-4xl font-semibold tracking-tight"><span className="grid size-11 place-items-center rounded-full bg-credit-soft"><Check className="size-6 text-credit" strokeWidth={3} /></span>Nothing due</span>}
          </div>
          {unknown && <p className="mt-3 text-[13px] text-ink-2">This figure did not arrive in a form this page could read, so it is not shown. Your entries below are unaffected. Ask the treasurer to confirm the balance.</p>}
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

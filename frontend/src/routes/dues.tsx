import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Check, Receipt } from 'lucide-react'
import { useDues, useLedger, useSummary } from '../lib/api'
import { useMeStrict, isCommittee, useCurrency } from '../lib/session'
import { day, plural } from '../lib/format'
import { toInput } from '../lib/money'
import { countable, owing, partition } from '../lib/countable'
import { duesTile } from '../lib/duestile'
import { scopeOf } from '../lib/scope'
import { listReadMap } from '../lib/listread'
import { Amount, Button, Card, Failed, Loading, PageTitle, Segmented, Sheet, cx } from '../components/ui'
import type { DuesRow } from '../lib/types'

export const Route = createFileRoute('/dues')({ component: Dues })

function Dues() {
  const ccy = useCurrency()
  const me = useMeStrict()
  const dues = useDues()
  const summary = useSummary()
  const [show, setShow] = useState<'all' | 'owing'>('all')
  const [open, setOpen] = useState<DuesRow | null>(null)
  /*
   * `flat_dues` is row-filtered by the server and `api_summary`'s totals are
   * not, so the two halves of this screen can describe different scopes. When
   * they do, the totals are hidden and the control stops saying "Every flat":
   * see lib/scope.ts for why this is read off the data and not off the seat.
   */
  const scope = scopeOf(dues.data, summary.data?.flats)
  const wings = useMemo(() => {
    const m = new Map<string, DuesRow[]>()
    /*
     * `owing` keeps the flats that might owe, which includes the ones whose
     * figure could not be read. The old test was `d.outstanding_minor <= 0`,
     * and `null <= 0` is true, so an unreadable flat was dropped from the
     * filter entirely - the treasurer's list came out short and nothing said
     * so. Erring towards showing a flat is the safe direction: the worst case
     * is chasing a flat that has paid, not missing one that has not.
     */
    const keep = partition(dues.data ?? [], (d) => d.outstanding_minor)
    const shown = show === 'owing' ? [...keep.owing, ...keep.unreadable] : (dues.data ?? [])
    for (const d of shown) {
      const w = d.label.split('-')[0]!
      m.set(w, [...(m.get(w) ?? []), d])
    }
    return [...m.entries()]
  }, [dues.data, show])

  return (
    <div>
      <PageTitle title="Dues" sub={scope.kind === 'partial'
        ? 'Charged to your flat, against what has been paid.'
        : 'Charged to each flat, against what each flat has paid.'}
        action={isCommittee(me) && <Link to="/new" search={{ kind: 'charge' }}><Button tone="primary" icon={<Receipt className="size-4" />}>Bill flats</Button></Link>} />

      {summary.data && scope.kind !== 'partial' && (
        <div className="mb-6 grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-[13px] text-ink-2">Outstanding</p>
            <Amount currency={ccy} minor={summary.data.outstanding_minor} size="lg" className="mt-1 block" />
          </Card>
          <Card className="p-4">
            <p className="text-[13px] text-ink-2">Flats owing</p>
            <p className="tnum mt-1 text-2xl font-semibold tracking-tight">{summary.data.flats_outstanding}<span className="text-base font-medium text-ink-2"> of {summary.data.flats}</span></p>
          </Card>
        </div>
      )}

      {scope.kind === 'partial' && (
        <Card className="mb-4 px-4 py-3 text-[13px] text-ink-2">
          You can see {plural(scope.got, 'flat')} of {scope.total}. Dues for the rest are
          visible to the committee. <Link to="/reports" className="font-medium text-accent">Society totals are in Reports.</Link>
        </Card>
      )}

      <Segmented<'all' | 'owing'> className="mb-4" label="Show" value={show} onChange={setShow}
        options={[{ value: 'all', label: scope.kind === 'partial' ? 'Your flats' : 'Every flat' }, { value: 'owing', label: 'Owing' }]} />

      {dues.isPending ? <Loading rows={3} /> : dues.isError ? <Failed error={dues.error} retry={() => dues.refetch()} /> : (
        <div className="space-y-6">
          {wings.map(([w, flats]) => (
            <section key={w}>
              <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-2">Wing {w}</h2>
              {/* Three columns below 380px: the figure is held to the 16px
                  floor, and a lakh-sized arrears figure does not fit a quarter
                  of a 320px screen at that size. */}
              <div className="grid grid-cols-3 gap-2 min-[380px]:grid-cols-4 sm:grid-cols-6 md:grid-cols-8">
                {flats.map((d) => {
                  /* lib/duestile.ts decides the state and the accessible
                   * name, which carries the exact figure. */
                  const t = duesTile(d.label, d.outstanding_minor, me.society.currency)
                  return (
                    <button key={d.flat_id} onClick={() => setOpen(d)} aria-label={t.label}
                      className={cx('flex aspect-square cursor-pointer flex-col items-center justify-center rounded-2xl border text-center transition-transform active:scale-95',
                        t.state === 'unknown' ? 'border-line bg-sunken text-ink-2' : t.state === 'owes' ? 'border-debit/25 bg-debit-soft text-debit' : 'border-line bg-surface text-ink')}>
                      <span className="tnum text-[13px] font-semibold">{d.label.split('-')[1]}</span>
                      {t.state === 'unknown' ? <span className="mt-0.5 text-base font-medium" aria-hidden="true">?</span>
                        : t.state === 'owes' ? <span className="tnum mt-0.5 text-base font-semibold leading-tight">{t.figure}</span>
                        : <Check className="mt-0.5 size-3.5 text-credit" strokeWidth={3} />}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          <p className="px-1 text-xs text-ink-2">Tiles show the amount owed without its decimals. Tap a flat for the exact figure.</p>
        </div>
      )}
      {open && <FlatSheet d={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

export function FlatSheet({ d, onClose }: { d: DuesRow; onClose: () => void }) {
  const ccy = useCurrency()
  const me = useMeStrict()
  const ledger = useLedger()
  /* Three outcomes, because "No payments recorded." is a claim about this
   * flat. It was rendered from `(ledger.data ?? [])`, which is empty while
   * the read is in flight AND after it has failed - so a flat that HAS paid
   * read as one that had not, on the sheet a treasurer opens to decide
   * whether to chase someone. Same family as `null <= 0` on the arrears
   * figure two lines below. */
  const paidRead = listReadMap(ledger, (rows) =>
    rows.filter((r) => r.flat_id === d.flat_id && r.origin_effect === 'receipt').slice(-6).toReversed(),
  )
  const paid = paidRead.kind === 'ready' ? paidRead.rows : []
  const owed = countable(d.outstanding_minor)
  return (
    <Sheet open onClose={onClose} title={`Flat ${d.label}`}
      footer={isCommittee(me) && owed.readable && owed.owing ? (
        <Link to="/new" search={{ kind: 'receipt', flat: d.flat_id, amount: toInput(owed.minor, ccy) }}>
          <Button tone="primary" className="w-full">Record a payment</Button>
        </Link>
      ) : undefined}>
      <div className="grid grid-cols-3 gap-2 text-center">
        {([['Charged', d.charged_minor], ['Paid', d.paid_minor], ['Owes', d.outstanding_minor]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl bg-sunken px-2 py-3">
            {/* Amount discloses an unreadable figure itself; the debit colour
                must not be applied to one, because `null > 0` is false and it
                would read as a settled amount in plain ink. */}
            <Amount currency={ccy} minor={v} size="sm" className={cx('font-semibold', l === 'Owes' && owing(v) && 'text-debit')} />
            <p className="text-xs text-ink-2">{l}</p>
          </div>
        ))}
      </div>
      <h3 className="mt-5 mb-1 text-[13px] font-medium text-ink-2">Recent payments</h3>
      {paid.length ? (
        <ul className="divide-y divide-line">
          {paid.map((r) => (
            <li key={r.seq}>
              <Link to="/entry/$seq" params={{ seq: String(r.seq) }} className="flex items-center justify-between py-2.5 text-sm">
                <span className={cx(r.reversed_by_seq !== null && 'line-through text-ink-2')}>{day(r.business_date, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <Amount currency={r.currency} minor={r.amount_minor} signed tone="auto" struck={!!r.reversed_by_seq} />
              </Link>
            </li>
          ))}
        </ul>
      ) : paidRead.kind === 'pending' ? <p className="text-sm text-ink-2">Loading payments…</p>
        : paidRead.kind === 'unknown' ? <p className="text-sm text-ink-2">The payment history could not be loaded, so this is not saying there are none.</p>
        : <p className="text-sm text-ink-2">No payments recorded.</p>}
      {/* The count is the same claim in figures: "0 payments shown" over an
        * unreadable history is as wrong as the sentence above it. */}
      <p className="mt-4 text-xs text-ink-2">
        {paidRead.kind === 'ready' ? `${plural(paid.length, 'payment')} shown. ` : ''}
        Charges follow each bill’s stored split.
      </p>
    </Sheet>
  )
}

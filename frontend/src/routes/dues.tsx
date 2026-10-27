import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Check, Receipt } from 'lucide-react'
import { useDues, useLedger, useSummary } from '../lib/api'
import { useMeStrict, isCommittee } from '../lib/session'
import { day, plural } from '../lib/format'
import { parts, toInput } from '../lib/money'
import { countable, owing, partition } from '../lib/countable'
import { Amount, Button, Card, Failed, Loading, PageTitle, Segmented, Sheet, cx } from '../components/ui'
import type { DuesRow } from '../lib/types'

export const Route = createFileRoute('/dues')({ component: Dues })

function Dues() {
  const me = useMeStrict()
  const dues = useDues()
  const summary = useSummary()
  const [show, setShow] = useState<'all' | 'owing'>('all')
  const [open, setOpen] = useState<DuesRow | null>(null)
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
      <PageTitle title="Dues" sub="Charged to each flat, against what each flat has paid."
        action={isCommittee(me) && <Link to="/new" search={{ kind: 'charge' }}><Button tone="primary" icon={<Receipt className="size-4" />}>Bill flats</Button></Link>} />

      {summary.data && (
        <div className="mb-6 grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-[13px] text-ink-2">Outstanding</p>
            <Amount minor={summary.data.outstanding_minor} size="lg" className="mt-1 block" />
          </Card>
          <Card className="p-4">
            <p className="text-[13px] text-ink-2">Flats owing</p>
            <p className="tnum mt-1 text-2xl font-semibold tracking-tight">{summary.data.flats_outstanding}<span className="text-base font-medium text-ink-2"> of {summary.data.flats}</span></p>
          </Card>
        </div>
      )}

      <Segmented<'all' | 'owing'> className="mb-4" label="Show" value={show} onChange={setShow}
        options={[{ value: 'all', label: 'Every flat' }, { value: 'owing', label: 'Owing' }]} />

      {dues.isPending ? <Loading rows={3} /> : dues.isError ? <Failed error={dues.error} retry={() => dues.refetch()} /> : (
        <div className="space-y-6">
          {wings.map(([w, flats]) => (
            <section key={w}>
              <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-2">Wing {w}</h2>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {flats.map((d) => {
                  /*
                   * Three states. A green check is a claim that the flat has
                   * settled, so a figure that could not be read must not get
                   * one - it reads as "paid" to every resident and treasurer
                   * who sees it. "?" plus the muted tile says unknown, and
                   * the accessible name says it in words.
                   */
                  const c = countable(d.outstanding_minor)
                  const owes = c.readable && c.owing
                  const unknown = !c.readable
                  return (
                    <button key={d.flat_id} onClick={() => setOpen(d)}
                      aria-label={`${d.label}, ${unknown ? 'amount could not be read' : owes ? 'owes' : 'settled'}`}
                      className={cx('flex aspect-square cursor-pointer flex-col items-center justify-center rounded-2xl border text-center transition-transform active:scale-95',
                        unknown ? 'border-line bg-sunken text-ink-2' : owes ? 'border-debit/25 bg-debit-soft text-debit' : 'border-line bg-surface text-ink')}>
                      <span className="tnum text-[13px] font-semibold">{d.label.split('-')[1]}</span>
                      {unknown ? <span className="mt-0.5 text-[10.5px] font-medium" aria-hidden="true">?</span>
                        : owes ? <span className="tnum mt-0.5 text-[10.5px] font-medium">{parts(c.minor, 'INR').whole}</span>
                        : <Check className="mt-0.5 size-3.5 text-credit" strokeWidth={3} />}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          <p className="px-1 text-xs text-ink-2">Tiles show whole rupees owed. Tap a flat for the exact figure.</p>
        </div>
      )}
      {open && <FlatSheet d={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

export function FlatSheet({ d, onClose }: { d: DuesRow; onClose: () => void }) {
  const me = useMeStrict()
  const ledger = useLedger()
  const paid = (ledger.data ?? []).filter((r) => r.flat_id === d.flat_id && r.origin_effect === 'receipt').slice(-6).toReversed()
  const owed = countable(d.outstanding_minor)
  return (
    <Sheet open onClose={onClose} title={`Flat ${d.label}`}
      footer={isCommittee(me) && owed.readable && owed.owing ? (
        <Link to="/new" search={{ kind: 'receipt', flat: d.flat_id, amount: toInput(owed.minor) }}>
          <Button tone="primary" className="w-full">Record a payment</Button>
        </Link>
      ) : undefined}>
      <div className="grid grid-cols-3 gap-2 text-center">
        {([['Charged', d.charged_minor], ['Paid', d.paid_minor], ['Owes', d.outstanding_minor]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl bg-sunken px-2 py-3">
            {/* Amount discloses an unreadable figure itself; the debit colour
                must not be applied to one, because `null > 0` is false and it
                would read as a settled amount in plain ink. */}
            <Amount minor={v} size="sm" className={cx('font-semibold', l === 'Owes' && owing(v) && 'text-debit')} />
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
                <Amount minor={r.amount_minor} signed tone="auto" struck={!!r.reversed_by_seq} />
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-2">No payments recorded.</p>}
      <p className="mt-4 text-xs text-ink-2">{plural(paid.length, 'payment')} shown. Charges follow each bill’s stored split.</p>
    </Sheet>
  )
}

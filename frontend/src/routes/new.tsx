import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, Receipt, Users, Vote } from 'lucide-react'
import { previewCharge, useCommittee, useLedger, useLimit, usePropose, useSociety } from '../lib/api'
import { supabase, unwrap, Refused } from '../lib/supabase'
import { useMeStrict } from '../lib/session'
import { isOfficer } from '../lib/pending'
import { hasEarlierToPayee } from '../lib/structuring'
import { approvalsNeeded, seatedCount } from '../lib/tier'
import { categories, month, monthOf, todayIST } from '../lib/format'
import { checkBusinessDate } from '../lib/businessdate'
import { format, parse } from '../lib/money'
import { countable } from '../lib/countable'
import { Button, Card, Field, Input, MoneyInput, PageTitle, Segmented, cx, useToast } from '../components/ui'

type Kind = 'expense' | 'receipt' | 'charge'

export const Route = createFileRoute('/new')({
  component: NewEntry,
  validateSearch: (s: Record<string, unknown>): { kind?: Kind | undefined; flat?: string | undefined; amount?: string | undefined } => ({
    ...(s.kind === 'expense' || s.kind === 'receipt' || s.kind === 'charge' ? { kind: s.kind } : {}),
    ...(typeof s.flat === 'string' ? { flat: s.flat } : {}),
    ...(typeof s.amount === 'string' ? { amount: s.amount } : {}),
  }),
})

function NewEntry() {
  const me = useMeStrict()
  const s = useSociety()
  const search = Route.useSearch()
  const nav = useNavigate()
  const toast = useToast()
  const propose = usePropose()
  const limit = useLimit()
  const committee = useCommittee()
  const ledger = useLedger()

  const [kind, setKind] = useState<Kind>(search.kind ?? 'expense')
  const [amount, setAmount] = useState(search.amount ?? '')
  const [payee, setPayee] = useState('')
  const [category, setCategory] = useState(kind === 'expense' ? 'repairs' : 'maintenance')
  const [date, setDate] = useState(todayIST())
  const [note, setNote] = useState('')
  const [flat, setFlat] = useState(search.flat ?? '')
  const [flatSet, setFlatSet] = useState<'all' | 'parking'>('all')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setCategory(kind === 'expense' ? 'repairs' : kind === 'charge' ? 'maintenance' : 'maintenance') }, [kind])

  const minor = parse(amount)
  /*
   * An unreadable limit must never produce `pair`. `minor <= null` is true in
   * JavaScript, so the old shape would have claimed the treasurer+secretary
   * tier for any amount the moment the limit could not be read - the exact
   * inversion 0004 forbids, and the display the proposer acts on.
   */
  const limRead = countable(limit.data?.current.limit_minor)
  const lim = limRead.readable ? limRead.minor : undefined
  const seated = seatedCount(committee.data?.seats)
  const needed = approvalsNeeded(seated)
  const pair = minor !== null && lim !== undefined && minor <= lim

  const flats = useQuery({
    queryKey: ['flats', s.id],
    queryFn: async () => unwrap(await supabase.from('flats').select('id,label,ordinal').eq('society_id', s.id).order('ordinal')),
  })
  const preview = useQuery({
    queryKey: ['preview', s.id, flatSet, minor],
    enabled: kind === 'charge' && !!minor,
    queryFn: () => previewCharge(s.id, flatSet, minor!),
  })
  const payees = useMemo(() => {
    const seen = new Map<string, number>()
    for (const r of ledger.data ?? []) if (r.effect === 'expense' && r.counterparty) seen.set(r.counterparty, (seen.get(r.counterparty) ?? 0) + 1)
    return [...seen.entries()].toSorted((a, b) => b[1] - a[1]).map(([n]) => n)
  }, [ledger.data])
  /*
   * Deliberately WHETHER, not how many: only the server knows the society's
   * date, so only the server can bound the window. The rule and the full
   * reasoning are in `lib/structuring.ts`, where they can be tested; this
   * used to be an inline count here and was wrong by two calendar days,
   * untested, because logic in a route needs a router to reach.
   */
  const anyRecentToPayee = useMemo(
    () => kind === 'expense' && hasEarlierToPayee(ledger.data, payee),
    [ledger.data, payee, kind],
  )

  /*
   * Below the limit only the two named officers sign as they submit, and this
   * is 0004's pair tier - the SAME rule waitsOn applies on the approvals
   * screen, so it comes from isOfficer rather than being spelled out a third
   * time. A committee member who is told "your approval is signed as you
   * submit" when it is not believes the entry needs one more signature than
   * it does, and stops chasing the one it is actually waiting on.
   */
  const selfApproves = pair ? isOfficer(me) : true
  /*
   * The date input carries `max`, and nothing read it: the input is not in a
   * `<form>`, so no implicit validation runs, and `ready` below tested the
   * amount, payee and note only. A future date reached the server with the
   * button fully enabled and came back as an error the screen already had
   * enough to give. `max` alone is a claim that the control is bounded, not a
   * bound.
   */
  const dateCheck = checkBusinessDate(date, todayIST())
  const ready = !!minor && dateCheck.ok && (kind === 'charge' || (kind === 'expense' ? !!payee.trim() : !!(flat || payee.trim()))) && (kind === 'charge' || !!note.trim())

  const submit = async () => {
    setError(null)
    const flatLabel = flats.data?.find((f) => f.id === flat)?.label
    try {
      const out = await propose.mutateAsync(
        kind === 'charge'
          ? { action: 'charge', amount_minor: minor, flat_set: flatSet, category, business_date: date,
              narration: note.trim() || `${category === 'parking' ? 'Parking' : 'Maintenance'} ${month(monthOf(date))}` }
          : { action: kind, amount_minor: minor, category, business_date: date, narration: note.trim(),
              counterparty: kind === 'receipt' && flat ? `Flat ${flatLabel}` : payee.trim(),
              ...(kind === 'receipt' && flat ? { flat_id: flat } : {}) },
      )
      toast(out.status === 'posted' ? 'Posted to the ledger.' : 'Proposed. It posts once approved.')
      nav({ to: '/approvals' })
    } catch (e) {
      setError(e instanceof Refused ? e.message : 'Could not submit. Nothing was recorded.')
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title="New entry" sub="It becomes a proposal. Nothing moves until it is approved." />
      <Segmented<Kind> className="mb-6" label="Kind of entry" value={kind} onChange={setKind}
        options={[
          { value: 'expense', label: <><ArrowUpRight className="size-4 text-debit" />Expense</> },
          { value: 'receipt', label: <><ArrowDownLeft className="size-4 text-credit" />Receipt</> },
          { value: 'charge', label: <><Receipt className="size-4" />Bill flats</> },
        ]} />

      <div className="space-y-5">
        <Field label={kind === 'charge' ? 'Total to bill' : 'Amount'} htmlFor="amount" error={amount && minor === null ? 'Enter an amount like 12,500 or 1250.50' : null}>
          <MoneyInput id="amount" value={amount} onChange={setAmount} autoFocus />
        </Field>

        {kind === 'expense' && (
          <Field label="Paid to" htmlFor="payee" hint={anyRecentToPayee ? `There are earlier below-limit payments to this payee. Payments to one payee that add up past the limit are shown together in the ledger and the AGM report, which count them over the society's own ${s.structuring_window_days}-day window.` : undefined}>
            <Input id="payee" list="payees" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Vendor or person" autoComplete="off" />
            <datalist id="payees">{payees.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
        )}

        {kind === 'receipt' && (
          <Field label="From" htmlFor="flat" hint="Pick the flat for maintenance, or name another payer.">
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <select id="flat" value={flat} onChange={(e) => setFlat(e.target.value)}
                className="h-12 rounded-xl border border-line bg-surface px-3 text-base">
                <option value="">No flat</option>
                {flats.data?.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <Input value={flat ? '' : payee} disabled={!!flat} onChange={(e) => setPayee(e.target.value)} placeholder={flat ? 'Flat selected' : 'Other payer'} aria-label="Other payer" />
            </div>
          </Field>
        )}

        {kind === 'charge' && (
          <Field label="Bill" htmlFor="set">
            <Segmented<'all' | 'parking'> label="Which flats" value={flatSet} onChange={(v) => { setFlatSet(v); setCategory(v === 'parking' ? 'parking' : 'maintenance') }}
              options={[{ value: 'all', label: 'Every flat' }, { value: 'parking', label: 'Flats with parking' }]} />
          </Field>
        )}

        {kind !== 'charge' && (
          <Field label="Category">
            <div className="flex flex-wrap gap-2">
              {categories.filter((c) => kind === 'receipt' ? ['maintenance', 'parking', 'events', 'other'].includes(c.id) : c.id !== 'maintenance').map((c) => (
                <button key={c.id} type="button" onClick={() => setCategory(c.id)} aria-pressed={category === c.id}
                  className={cx('h-9 cursor-pointer rounded-full border px-3.5 text-sm font-medium transition-colors',
                    category === c.id ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2 hover:text-ink')}>
                  {c.label}
                </button>
              ))}
            </div>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="date">
            <Input id="date" type="date" max={todayIST()} value={date} onChange={(e) => setDate(e.target.value)}
              aria-invalid={!dateCheck.ok || undefined}
              aria-describedby={dateCheck.ok ? undefined : 'date-error'} />
            {/*
              * Said out loud rather than only disabling Propose: a button that
              * goes grey with no reason is a dead end, and the date is the one
              * field whose problem is invisible once it is typed.
              */}
            {!dateCheck.ok && <p id="date-error" className="mt-1.5 text-sm text-break">{dateCheck.message}</p>}
          </Field>
          <Field label={kind === 'receipt' ? 'Reference' : kind === 'charge' ? 'Title' : 'What for'} htmlFor="note">
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280}
              placeholder={kind === 'receipt' ? 'UPI ref 6044…' : kind === 'charge' ? `Maintenance ${month(monthOf(date), { month: 'short', year: 'numeric' })}` : 'Pump repair, A wing'} />
          </Field>
        </div>

        {kind === 'charge' && preview.data && (
          <Card className="rise p-4">
            <p className="text-sm font-medium">{preview.data.flats} flats, {format(preview.data.base_minor)} each</p>
            <p className="mt-1 text-[13px] text-ink-2">
              {preview.data.extra_flats
                ? `${preview.data.extra_flats} flats pay 1 paisa more this time: the ones that have had it least often.`
                : 'Divides exactly. No flat pays extra.'}
            </p>
          </Card>
        )}

        <Card className={cx('flex items-start gap-3 p-4', !minor && 'opacity-60')}>
          <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl', pair ? 'bg-accent-soft text-accent' : 'bg-sunken text-ink')}>
            {pair ? <Users className="size-[18px]" /> : <Vote className="size-[18px]" />}
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-medium">{!minor ? 'Approval depends on the amount' : pair ? 'Needs the treasurer and the secretary' : `Needs ${needed} of ${seated} committee members`}</p>
            <p className="mt-0.5 text-[13px] text-ink-2">
              {lim !== undefined && `The limit is ${format(lim, 'INR', { compact: true })}. `}
              {minor ? (selfApproves ? 'Your approval is signed as you submit.' : 'You propose; the treasurer and secretary approve.') : ''}
            </p>
          </div>
        </Card>

        {error && <p className="text-sm text-break" role="alert">{error}</p>}
        <Button tone="primary" size="lg" className="w-full" busy={propose.isPending} disabled={!ready} onClick={submit}>
          {kind === 'charge' ? 'Propose charge' : 'Propose'}
        </Button>
      </div>
    </div>
  )
}

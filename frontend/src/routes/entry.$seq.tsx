import { useMemo, useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, CircleDashed, Flag, Undo2, X, ChevronDown } from 'lucide-react'
import { useLedger, useNames, useProposals, usePropose, useSociety, useDisputes, useLimit } from '../lib/api'
import { supabase, unwrap, bytea, Refused } from '../lib/supabase'
import { useMeStrict, isCommittee } from '../lib/session'
import { categoryLabel, instant, longDay, plural, roleLabel, rowTitle, tierLabel, actionLabel } from '../lib/format'
import { format, parse } from '../lib/money'
import {
  Amount, Avatar, Button, Card, Caption, Chip, EntryIcon, Facts, Field, Fingerprint, Loading, MoneyInput, Sheet, Textarea, useToast, cx,
} from '../components/ui'
import { RaiseDispute } from '../components/RaiseDispute'
import type { LedgerRow, ProposalRow } from '../lib/types'

export const Route = createFileRoute('/entry/$seq')({ component: EntryPage })

function EntryPage() {
  const { seq } = Route.useParams()
  const n = Number(seq)
  const ledger = useLedger()
  const proposals = useProposals()
  const r = ledger.data?.find((x) => x.seq === n)
  const p = proposals.data?.find((x) => x.seq === r?.proposal_seq)
  const router = useRouter()

  return (
    <div>
      <button onClick={() => router.history.length > 1 ? router.history.back() : router.navigate({ to: '/ledger' })}
        className="mb-4 -ml-2 inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </button>
      {ledger.isPending || proposals.isPending ? <Loading rows={3} />
        : !r || !p ? <Card className="p-6"><p className="font-medium">Entry #{seq} is not a money entry.</p><Link to="/verify" className="mt-2 inline-block text-sm text-accent">See the whole record</Link></Card>
        : <Detail r={r} p={p} />}
    </div>
  )
}

function Detail({ r, p }: { r: LedgerRow; p: ProposalRow }) {
  const me = useMeStrict()
  const s = useSociety()
  const ledger = useLedger()
  const disputes = useDisputes()
  const names = useNames()
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [reverseOpen, setReverseOpen] = useState(false)
  const byseq = useMemo(() => new Map((ledger.data ?? []).map((x) => [x.seq, x])), [ledger.data])
  const reversedBy = r.reversed_by_seq ? byseq.get(r.reversed_by_seq) : undefined
  const reverses = r.reverses_seq ? byseq.get(r.reverses_seq) : undefined
  const nonCash = r.effect === 'charge' || r.effect === 'charge_reversal'

  const entry = useQuery({
    queryKey: ['entry', s.id, r.seq],
    queryFn: async () => unwrap(await supabase.from('chain_entries').select('entry_hash,prev_hash').eq('society_id', s.id).eq('sequence', r.seq).single()),
  })
  const flagged = (disputes.data ?? []).filter((d) => d.target_seqs.includes(r.seq) || (d.counterparty && d.counterparty.toLowerCase() === r.counterparty?.toLowerCase()))
  const canReverse = isCommittee(me) && !r.reversed_by_seq && !r.reverses_seq && (r.effect === 'expense' || r.effect === 'receipt' || r.effect === 'charge')

  return (
    <div className="space-y-6">
      <Card className="rise overflow-hidden">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <EntryIcon category={r.category} effect={r.effect} />
            <div className="min-w-0 flex-1">
              <h1 className={cx('text-xl font-semibold tracking-tight', reversedBy && 'line-through decoration-ink-2/50')}>{rowTitle(r)}</h1>
              <p className="mt-0.5 text-sm text-ink-2"><Facts items={[longDay(r.business_date), categoryLabel(r.category), `#${r.seq}`]} /></p>
            </div>
          </div>
          <div className="mt-5">
            <Amount minor={r.amount_minor} currency={r.currency} signed={!nonCash} size="hero" tone={nonCash ? 'muted' : 'auto'} struck={!!reversedBy} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {nonCash ? <Chip>Billed to flats, not cash</Chip> : <Chip tone={r.amount_minor < 0 ? 'debit' : 'credit'}>{r.amount_minor < 0 ? 'Money out' : 'Money in'}</Chip>}
            {reversedBy && <Chip tone="break">Reversed</Chip>}
            {flagged.some((d) => d.is_open) && <Chip tone="break" icon={<Flag className="size-3" />}>Disputed</Chip>}
          </div>
          {r.narration && r.narration !== rowTitle(r) && <p className="mt-4 text-[15px] leading-relaxed">{r.narration}</p>}
        </div>

        {(reversedBy || reverses) && (
          <Link to="/entry/$seq" params={{ seq: String((reversedBy ?? reverses)!.seq) }}
            className="flex items-start gap-3 border-t border-line bg-break-soft/50 px-5 py-4 hover:bg-break-soft">
            <Undo2 className="mt-0.5 size-4 shrink-0 text-break" />
            <div className="min-w-0 text-sm">
              <p className="font-medium">{reversedBy ? `Reversed by #${reversedBy.seq}` : `Reverses #${reverses!.seq}`}, {longDay((reversedBy ?? r).business_date)}</p>
              <p className="mt-0.5 text-ink-2">{(reversedBy ?? r).reason}</p>
            </div>
          </Link>
        )}
      </Card>

      {r.effect === 'charge' || r.effect === 'charge_reversal' ? <Allocation r={r} /> : null}

      <section>
        <Caption>Approval trail</Caption>
        <Card className="p-5"><Trail p={p} r={r} names={names} /></Card>
      </section>

      {flagged.length > 0 && (
        <section>
          <Caption action={<Link to="/disputes" className="text-sm font-medium text-accent">All disputes</Link>}>Disputes</Caption>
          <Card className="divide-y divide-line">
            {flagged.map((d) => (
              <div key={d.seq} className="flex items-start gap-3 p-4">
                <Flag className={cx('mt-0.5 size-4 shrink-0', d.is_open ? 'text-break' : 'text-ink-2')} />
                <div className="min-w-0 text-sm">
                  <p>{d.text}</p>
                  <p className="mt-1 text-xs text-ink-2"><Facts items={[d.is_open ? 'Open' : 'Resolved by its author', `${d.notes.length} notes`, instant(d.recorded_at)]} /></p>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section>
        <Caption action={<Link to="/verify" className="text-sm font-medium text-accent">Check the whole record</Link>}>Fingerprint</Caption>
        <Card className="space-y-3 p-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-ink-2">This entry</span>
            <Fingerprint value={r.fingerprint} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-ink-2">Links to #{r.seq - 1}</span>
            {entry.data ? <Fingerprint value={bytea(entry.data.prev_hash)} /> : <span className="h-6" />}
          </div>
          <p className="text-[13px] text-ink-2">Changing this entry would change its fingerprint and break every link after it.</p>
        </Card>
      </section>

      <div className="flex flex-wrap gap-2">
        {me.tenure && <Button icon={<Flag className="size-4" />} onClick={() => setDisputeOpen(true)}>Dispute</Button>}
        {canReverse && <Button tone="danger" icon={<Undo2 className="size-4" />} onClick={() => setReverseOpen(true)}>Reverse</Button>}
      </div>

      {me.tenure && <RaiseDispute open={disputeOpen} onClose={() => setDisputeOpen(false)} seq={r.seq} counterparty={r.counterparty} />}
      {canReverse && <ReverseSheet open={reverseOpen} onClose={() => setReverseOpen(false)} r={r} p={p} />}
    </div>
  )
}

function Trail({ p, r, names }: { p: ProposalRow; r: LedgerRow; names: Map<string, string> }) {
  const steps = [
    { key: 'p', icon: <Avatar name={names.get(p.proposed_by) ?? '?'} size="sm" />, title: `Proposed by ${names.get(p.proposed_by) ?? 'a committee member'}`, sub: instant(p.recorded_at), tone: 'neutral' },
    ...p.approvals.map((a) => ({
      key: `a${a.seq}`,
      icon: <span className={cx('grid size-7 place-items-center rounded-full', a.decision === 'approve' ? 'bg-accent-soft text-accent' : 'bg-break-soft text-break')}>
        {a.decision === 'approve' ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}</span>,
      title: `${a.decision === 'approve' ? 'Approved' : 'Declined'} by ${names.get(a.person) ?? 'a member'}`,
      sub: `${roleLabel[a.role]}${a.derived ? ', seated under the emergency rule' : ''} · signed ${instant(a.recorded_at)}`,
      tone: 'neutral',
    })),
    { key: 'posted', icon: <span className="grid size-7 place-items-center rounded-full bg-ink text-bg"><CircleDashed className="size-3.5" /></span>, title: `Posted as #${r.seq}`, sub: instant(r.recorded_at), tone: 'neutral' },
  ]
  return (
    <div>
      <ol className="relative space-y-4">
        <span aria-hidden className="absolute top-3 bottom-3 left-[13px] w-px bg-line" />
        {steps.map((st) => (
          <li key={st.key} className="relative flex items-start gap-3">
            <span className="relative z-10 rounded-full bg-surface">{st.icon}</span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-medium">{st.title}</p>
              <p className="text-xs text-ink-2">{st.sub}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-xl bg-sunken px-3 py-2.5 text-[13px] text-ink-2">
        Needed {tierLabel(p)}{p.tier === 'pair' ? `, at or below the ${format(p.limit_minor, 'INR', { compact: true })} limit then in force` : `, above the ${format(p.limit_minor, 'INR', { compact: true })} limit then in force`}.
      </p>
    </div>
  )
}

function Allocation({ r }: { r: LedgerRow }) {
  const me = useMeStrict()
  const s = useSociety()
  const [all, setAll] = useState(false)
  const q = useQuery({
    queryKey: ['alloc', s.id, r.proposal_seq],
    queryFn: async () => {
      const e = unwrap(await supabase.from('chain_entries').select('body').eq('society_id', s.id).eq('sequence', r.proposal_seq).single())
      const flats = unwrap(await supabase.from('flats').select('id,label,ordinal').eq('society_id', s.id))
      return { body: e.body as unknown as { flat_ids: string[]; line_amounts: number[]; remainder_flats: string[]; flat_set: string }, flats: new Map(flats.map((f) => [f.id, f.label])) }
    },
  })
  if (!q.data) return <Loading rows={1} />
  const { body, flats } = q.data
  const mine = me.tenure ? body.flat_ids.indexOf(me.tenure.flat_id) : -1
  const extra = new Set(body.remainder_flats)
  return (
    <section>
      <Caption>Split across flats</Caption>
      <Card className="p-5">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Flats" value={body.flat_ids.length.toString()} />
          <Stat label="Each" value={format(Math.min(...body.line_amounts.map(Math.abs)) * Math.sign(r.amount_minor))} />
          <Stat label="+1 paisa" value={plural(body.remainder_flats.length, 'flat')} />
        </div>
        {mine >= 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-accent-soft px-4 py-3 text-sm">
            <span className="font-medium">Your flat, {me.tenure!.flat}</span>
            <Amount minor={body.line_amounts[mine]!} />
          </div>
        )}
        <p className="mt-4 text-[13px] text-ink-2">The paisa that does not divide goes to the flats that have had it least often, so no flat pays more over time.</p>
        <button onClick={() => setAll(!all)} className="mt-3 inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-accent">
          {all ? 'Hide' : 'Show'} every flat <ChevronDown className={cx('size-4 transition-transform', all && 'rotate-180')} />
        </button>
        {all && (
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {body.flat_ids.map((id, i) => (
              <div key={id} className="flex justify-between gap-2 py-0.5">
                <span className={cx(extra.has(id) && 'font-medium')}>{flats.get(id)}</span>
                <Amount minor={body.line_amounts[i]!} size="sm" className={cx(!extra.has(id) && 'text-ink-2')} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-sunken px-2 py-3">
      <p className="tnum text-[15px] font-semibold">{value}</p>
      <p className="text-xs text-ink-2">{label}</p>
    </div>
  )
}

function ReverseSheet({ open, onClose, r, p }: { open: boolean; onClose: () => void; r: LedgerRow; p: ProposalRow }) {
  const propose = usePropose()
  const limit = useLimit()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [replace, setReplace] = useState(false)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const repl = replace ? parse(amount) : null
  const lim = limit.data?.current.limit_minor ?? 0
  const committee = p.tier === 'committee' || Math.abs(r.amount_minor) > lim || (repl ?? 0) > lim

  const submit = async () => {
    setError(null)
    try {
      const out = await propose.mutateAsync({
        action: 'reversal', target_seq: r.seq, reason,
        narration: `${replace ? 'Correct' : 'Reverse'} ${rowTitle(r)}`,
        ...(replace && repl ? { replacement_amount_minor: repl } : {}),
      })
      toast(out.status === 'posted' ? 'Reversed.' : 'Reversal proposed. It needs approval before it posts.')
      onClose()
    } catch (e) {
      setError(e instanceof Refused ? e.message : 'Could not propose it. Try again.')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`${actionLabel.reversal} of #${r.seq}`}
      footer={<Button tone="danger" className="w-full" busy={propose.isPending} disabled={!reason.trim() || (replace && !repl)} onClick={submit}>Propose reversal</Button>}>
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-2xl bg-sunken p-4">
          <span className="text-sm font-medium">{rowTitle(r)}</span>
          <Amount minor={r.amount_minor} signed />
        </div>
        <Field label="Why?" htmlFor="reason" hint="Required. Everyone can read it, forever." error={error}>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Invoice entered twice" />
        </Field>
        {r.effect !== 'charge' && (
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="size-5 accent-[var(--accent)]" />
            Post the correct amount in the same step
          </label>
        )}
        {replace && <Field label="Correct amount" htmlFor="repl"><MoneyInput id="repl" value={amount} onChange={setAmount} /></Field>}
        <ul className="space-y-1.5 text-[13px] text-ink-2">
          <li>The original stays visible, marked reversed. Nothing is deleted.</li>
          <li>Needs {committee ? 'a committee vote' : 'the treasurer and the secretary'}: at least the approval the original had.</li>
          <li>An entry can be reversed once. A reversal cannot be reversed.</li>
        </ul>
      </div>
    </Sheet>
  )
}

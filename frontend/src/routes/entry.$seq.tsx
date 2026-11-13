import { useMemo, useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, CircleDashed, Flag, Undo2, X, ChevronDown } from 'lucide-react'
import { useLedger, useNames, useProposals, usePropose, useSociety, useDisputes, useLimit } from '../lib/api'
import { entryDisputes } from '../lib/disputed'
import { entryMessage, entryOutcome } from '../lib/entryview'
import { supabase, unwrap, bytea, Refused } from '../lib/supabase'
import { useMeStrict, isCommittee } from '../lib/session'
import { categoryLabel, instant, longDay, plural, roleLabel, rowTitle, tierLabel, actionLabel, writeOutcome } from '../lib/format'
import { format, parse } from '../lib/money'
import { countable, direction } from '../lib/countable'
import { needsCommittee } from '../lib/reversaltier'
import { allocationBody, lineFor, split } from '../lib/allocation'
import { parse as parseShape } from '../lib/parse'
import {
  Amount, Avatar, Button, Card, Caption, Chip, EntryIcon, Facts, Failed, Field, Fingerprint, Loading, MoneyInput, Sheet, Textarea, useToast, cx,
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

  /*
   * `!r || !p` printed "is not a money entry" for a failed read, a seq that
   * never existed and a posting whose proposal was missing alike - a claim
   * about the chain made in three cases where nothing had been established.
   * The decision is in lib/ so it can be tested without mounting a router.
   */
  const outcome = entryOutcome(
    Number.isFinite(n),
    { isPending: ledger.isPending, isError: ledger.isError, found: !!r },
    { isPending: proposals.isPending, isError: proposals.isError, found: !!p },
  )
  const message = entryMessage(outcome.kind, seq)

  return (
    <div>
      <button onClick={() => router.history.length > 1 ? router.history.back() : router.navigate({ to: '/ledger' })}
        className="mb-4 -ml-2 inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" /> Back
      </button>
      {outcome.kind === 'loading' ? <Loading rows={3} />
        : outcome.kind === 'ready' && r && p ? <Detail r={r} p={p} />
        : <Card className="p-6">
            <p className="font-medium">{message}</p>
            <Link to="/verify" className="mt-2 inline-block text-sm text-accent">See the whole record</Link>
          </Card>}
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
  const dir = direction(r.amount_minor)

  const entry = useQuery({
    queryKey: ['entry', s.id, r.seq],
    queryFn: async () => unwrap(await supabase.from('chain_entries').select('entry_hash,prev_hash').eq('society_id', s.id).eq('sequence', r.seq).single()),
  })
  /*
   * Decided in lib/, three ways, because `(disputes.data ?? [])` filtered to
   * nothing on a FAILED read and `{flagged.length > 0 && ...}` then removed
   * the Disputes section entirely - showing a resident who opened this entry
   * to read a dispute a screen with no disputes on it. The match itself is
   * not reimplemented here; the route's old copy of it would not have stayed
   * in step with the ledger's.
   */
  const flaggedState = entryDisputes(
    { data: disputes.data, isPending: disputes.isPending, isError: disputes.isError },
    r,
  )
  const flagged = flaggedState.kind === 'ready' ? flaggedState.rows : []
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
            {nonCash ? <Chip>Billed to flats, not cash</Chip>
              : dir === 'out' ? <Chip tone="debit">Money out</Chip>
              : dir === 'in' ? <Chip tone="credit">Money in</Chip>
              : dir === 'flat' ? <Chip>No change to the balance</Chip>
              : <Chip tone="break">Direction could not be read</Chip>}
            {reversedBy && <Chip tone="break">Reversed</Chip>}
            {/*
              * Three states. An absent chip says this entry is not disputed,
              * so an unreadable dispute list must not render as one.
              */}
            {flaggedState.kind === 'ready'
              ? flagged.some((d) => d.is_open) && <Chip tone="break" icon={<Flag className="size-3" />}>Disputed</Chip>
              : flaggedState.kind === 'pending'
                ? <Chip icon={<Flag className="size-3" />}>Checking for disputes</Chip>
                : <Chip icon={<Flag className="size-3" />}>Dispute status unavailable</Chip>}
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

      {/*
        * The section appears whenever the answer is not a confident "none".
        * Hiding it on a failed read is the defect: this is the screen a
        * resident opens to read the dispute itself.
        */}
      {flaggedState.kind === 'unknown' ? (
        <section>
          <Caption action={<Link to="/disputes" className="text-sm font-medium text-accent">All disputes</Link>}>Disputes</Caption>
          <Card className="p-4 text-sm text-ink-2">
            The dispute list did not load, so this is not saying there are none. The entry above is unaffected.
          </Card>
        </section>
      ) : flaggedState.kind === 'pending' ? (
        <section>
          <Caption>Disputes</Caption>
          <Loading rows={1} />
        </section>
      ) : flagged.length > 0 && (
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
        Needed {tierLabel(p)}{p.tier === 'pair' ? `, at or below the ${format(p.limit_minor, r.currency, { compact: true })} limit then in force` : `, above the ${format(p.limit_minor, r.currency, { compact: true })} limit then in force`}.
      </p>
    </div>
  )
}

function Allocation({ r }: { r: LedgerRow }) {
  const ccy = r.currency
  const me = useMeStrict()
  const s = useSociety()
  const [all, setAll] = useState(false)
  const q = useQuery({
    queryKey: ['alloc', s.id, r.proposal_seq],
    queryFn: async () => {
      const e = unwrap(await supabase.from('chain_entries').select('body').eq('society_id', s.id).eq('sequence', r.proposal_seq).single())
      const flats = unwrap(await supabase.from('flats').select('id,label,ordinal').eq('society_id', s.id))
      return { alloc: split(parseShape(allocationBody, e.body, 'allocation')), flats: new Map(flats.map((f) => [f.id, f.label])) }
    },
  })
  /*
   * `!q.data` is true while this is loading AND after it has FAILED, and a
   * single skeleton stood for both - so a failed read shimmered forever here,
   * with no error and no retry. Two reads and a `.single()` go out above, and
   * `parseShape` can reject the body, so failing is not remote.
   *
   * Two states, not the three `/my-flat` needed: a missing allocation row
   * makes `.single()` an error, so there is no successful-but-absent case to
   * tell apart. The error is disclosed, because a broken split means a flat's
   * charge is not being shown to anyone - the same reason the mismatch below
   * is disclosed rather than quietly truncated.
   */
  if (q.isError) return <Failed error={q.error} retry={() => q.refetch()} />
  if (!q.data) return <Loading rows={1} />
  const { alloc, flats } = q.data
  const mine = lineFor(alloc, me.tenure?.flat_id)
  const eachReadable = countable(alloc.each)
  return (
    <section>
      <Caption>Split across flats</Caption>
      <Card className="p-5">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Flats" value={alloc.lines.length.toString()} />
          <Stat label="Each" value={eachReadable.readable ? format(eachReadable.minor, ccy) : 'Not available'} />
          <Stat label="+1 paisa" value={plural(alloc.remainderCount, 'flat')} />
        </div>
        {/* A broken entry is disclosed, not truncated in silence: a flat
            missing from one of the two lists is a flat whose charge nobody
            is being shown. */}
        {alloc.mismatch && (
          <p className="mt-4 rounded-xl bg-sunken px-4 py-3 text-[13px] text-ink-2">
            This split is incomplete in the record: the list of flats and the list of amounts do not match. The figures below are the flats that could be paired.
          </p>
        )}
        {mine && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-accent-soft px-4 py-3 text-sm">
            <span className="font-medium">Your flat, {me.tenure!.flat}</span>
            <Amount currency={ccy} minor={mine.minor} />
          </div>
        )}
        <p className="mt-4 text-[13px] text-ink-2">The paisa that does not divide goes to the flats that have had it least often, so no flat pays more over time.</p>
        <button onClick={() => setAll(!all)} className="mt-3 inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-accent">
          {all ? 'Hide' : 'Show'} every flat <ChevronDown className={cx('size-4 transition-transform', all && 'rotate-180')} />
        </button>
        {all && (
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {alloc.lines.map((l) => (
              <div key={l.flat_id} className="flex justify-between gap-2 py-0.5">
                <span className={cx(l.remainder && 'font-medium')}>{flats.get(l.flat_id) ?? l.flat_id}</span>
                <Amount currency={ccy} minor={l.minor} size="sm" className={cx(!l.remainder && 'text-ink-2')} />
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
  const ccy = r.currency
  const propose = usePropose()
  const limit = useLimit()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [replace, setReplace] = useState(false)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  // `null` here means the field would not parse; `reversaltier` needs that
  // distinct from "no replacement", so it is never coalesced to a number.
  const repl = replace ? parse(amount, ccy) : null
  /*
   * The tier is `lib/reversaltier.ts`'s decision, not this sheet's. It used
   * to be computed here, which meant reaching it required mounting a router
   * and so it was never tested - and it was wrong in one operand: the old
   * `(repl ?? 0) > limNow.minor` collapsed "no replacement" and "a
   * replacement that would not parse" into `0`, and `0 > limit` is false,
   * so an unparseable or overflowed replacement bought the PAIR tier. One
   * operand to the right of the comment explaining that exact trap.
   */
  const committee = needsCommittee({
    originalTier: p.tier,
    amountMinor: r.amount_minor,
    limitMinor: limit.data?.current.limit_minor,
    replacement: replace ? repl : undefined,
  })

  const submit = async () => {
    setError(null)
    try {
      const out = await propose.mutateAsync({
        action: 'reversal', target_seq: r.seq, reason,
        narration: `${replace ? 'Correct' : 'Reverse'} ${rowTitle(r)}`,
        ...(replace && repl ? { replacement_amount_minor: repl } : {}),
      })
      const outcome = writeOutcome(out.status)
      toast(
        outcome === 'posted' ? 'Reversed.'
        : outcome === 'open' ? 'Reversal proposed. It needs approval before it posts.'
        : outcome === 'closed' ? 'The reversal was proposed and already closed. Open it in Approvals to see why.'
        : 'Reversal proposed. Open it in Approvals to see where it stands.',
      )
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
          <Amount currency={ccy} minor={r.amount_minor} signed />
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
        {replace && (
          <Field label="Correct amount" htmlFor="repl"
            error={amount.trim() && repl === null ? 'Enter an amount like 12,500. A replacement cannot be negative.' : null}>
            <MoneyInput id="repl" value={amount} onChange={setAmount} />
          </Field>
        )}
        <ul className="space-y-1.5 text-[13px] text-ink-2">
          <li>The original stays visible, marked reversed. Nothing is deleted.</li>
          <li>Needs {committee ? 'a committee vote' : 'the treasurer and the secretary'}: at least the approval the original had.</li>
          <li>An entry can be reversed once. A reversal cannot be reversed.</li>
        </ul>
      </div>
    </Sheet>
  )
}

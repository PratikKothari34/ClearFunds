import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Check, CheckCheck, Inbox, Plus, Undo2, X } from 'lucide-react'
import { useCast, useLimit, useNames, useProposals, useWithdraw } from '../lib/api'
import { Refused } from '../lib/supabase'
import { useMeStrict } from '../lib/session'
import { actionLabel, ago, categoryLabel, day, plural, proposalTitle, roleLabel, tierLabel } from '../lib/format'
import { format } from '../lib/money'
import { countable } from '../lib/countable'
import { Amount, Avatar, Button, Card, Chip, Empty, Facts, Failed, Loading, Meter, PageTitle, Segmented, Sheet, useToast, cx } from '../components/ui'
import { waitsOn } from '../components/Shell'
import type { ProposalRow } from '../lib/types'

export const Route = createFileRoute('/approvals')({ component: Approvals })

type Tab = 'mine' | 'others' | 'closed'

function Approvals() {
  const me = useMeStrict()
  const proposals = useProposals()
  const [tab, setTab] = useState<Tab>('mine')
  const groups = useMemo(() => {
    const all = (proposals.data ?? []).toReversed()
    return {
      mine: all.filter((p) => waitsOn(p, me)),
      others: all.filter((p) => p.state === 'open' && !waitsOn(p, me)),
      closed: all.filter((p) => p.state !== 'open').slice(0, 60),
    }
  }, [proposals.data, me])
  const list = groups[tab]
  const receipts = groups.mine.filter((p) => p.action === 'receipt')

  return (
    <div>
      <PageTitle title="Approvals" sub="Nothing posts until enough of the committee signs."
        action={me.seat && <Link to="/new"><Button tone="primary" icon={<Plus className="size-4" />}>New</Button></Link>} />
      <Segmented<Tab> className="mb-4" label="Approvals" value={tab} onChange={setTab}
        options={[
          { value: 'mine', label: 'For you', count: groups.mine.length },
          { value: 'others', label: 'Waiting on others', count: groups.others.length },
          { value: 'closed', label: 'Done' },
        ]} />

      {tab === 'mine' && receipts.length > 1 && <BulkReceipts items={receipts} />}

      {proposals.isPending ? <Loading />
        : proposals.isError ? <Failed error={proposals.error} retry={() => proposals.refetch()} />
        : !list.length ? (
          <Empty icon={<Inbox className="size-5" />} title={tab === 'mine' ? 'Nothing waits on you' : tab === 'others' ? 'Nothing is waiting' : 'No decisions yet'}>
            {tab === 'mine' && 'New proposals appear here the moment they are made.'}
          </Empty>
        )
        : <div className="space-y-3">{list.map((p) => <ProposalCard key={p.seq} p={p} canAct={tab === 'mine'} />)}</div>}
    </div>
  )
}

function ProposalCard({ p, canAct }: { p: ProposalRow; canAct: boolean }) {
  const me = useMeStrict()
  const names = useNames()
  const cast = useCast()
  const withdraw = useWithdraw()
  const toast = useToast()
  const limit = useLimit()
  const [confirm, setConfirm] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const mineToWithdraw = p.state === 'open' && p.proposed_by === me.person

  const act = async (decision: 'approve' | 'decline') => {
    try {
      const out = await cast.mutateAsync({ seq: p.seq, decision })
      toast(out.status === 'posted' ? 'Approved. It is now on the ledger.' : out.status === 'declined' ? 'Declined. The proposal is closed.' : 'Signed. Waiting for the others.')
    } catch (e) {
      toast(e instanceof Refused ? e.message : 'Could not record that. Try again.', 'error')
    } finally {
      setConfirm(false)
      setDeclineOpen(false)
    }
  }

  const stateChip = p.state === 'posted' ? <Chip tone="credit">Posted</Chip>
    : p.state === 'declined' ? <Chip tone="break">Declined</Chip>
    : p.state === 'withdrawn' ? <Chip>Withdrawn</Chip>
    : p.state === 'superseded' ? <Chip>Superseded</Chip>
    : p.state === 'year_closed' ? <Chip>Year closed</Chip>
    : null

  return (
    <Card as="article" className={cx('rise overflow-hidden', canAct && 'border-attention/30')}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-2"><Facts items={[actionLabel[p.action], ago(p.recorded_at), `#${p.seq}`]} /></p>
            <h3 className="mt-1 truncate text-[17px] font-semibold tracking-tight">{proposalTitle(p, names)}</h3>
          </div>
          {p.amount_minor !== null && (
            <Amount minor={p.action === 'expense' ? -p.amount_minor : p.amount_minor} signed={p.action !== 'limit_change'} size="lg"
              tone={p.action === 'expense' || p.action === 'receipt' ? 'auto' : 'ink'} className="shrink-0 text-xl" />
          )}
        </div>

        <Body p={p} limitNow={countable(limit.data?.current.limit_minor).readable ? limit.data!.current.limit_minor! : undefined} />

        <div className="mt-4 space-y-2">
          <Meter have={p.approve_count} need={p.required} declined={p.decline_count} />
          <div className="flex items-center justify-between gap-3 text-xs text-ink-2">
            <span>Needs {tierLabel(p)}</span>
            <span className="flex -space-x-1.5">
              {p.approvals.filter((a) => a.decision === 'approve').slice(0, 8).map((a) => (
                <span key={a.seq} title={`${names.get(a.person)}, ${roleLabel[a.role]}`} className="rounded-full ring-2 ring-surface">
                  <Avatar name={names.get(a.person) ?? '?'} size="sm" />
                </span>
              ))}
            </span>
          </div>
        </div>
        {stateChip && <div className="mt-3">{stateChip}</div>}
      </div>

      {(canAct || mineToWithdraw) && (
        <div className="flex gap-2 border-t border-line bg-sunken/40 px-4 py-3 sm:px-5">
          {canAct && (confirm ? (
            <>
              <Button tone="primary" className="flex-1" busy={cast.isPending} icon={<Check className="size-4" />} onClick={() => act('approve')}>Sign approval</Button>
              <Button tone="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
            </>
          ) : (
            <>
              <Button tone="primary" className="flex-1" icon={<Check className="size-4" />} onClick={() => setConfirm(true)}>Approve</Button>
              <Button className="flex-1" icon={<X className="size-4" />} onClick={() => setDeclineOpen(true)}>Decline</Button>
            </>
          ))}
          {!canAct && mineToWithdraw && (
            <Button tone="ghost" busy={withdraw.isPending} icon={<Undo2 className="size-4" />}
              onClick={async () => { try { await withdraw.mutateAsync(p.seq); toast('Withdrawn. It stays on the record as withdrawn.') } catch (e) { toast(e instanceof Refused ? e.message : 'Could not withdraw.', 'error') } }}>
              Withdraw my proposal
            </Button>
          )}
        </div>
      )}
      {confirm && <p className="border-t border-line px-5 py-2 text-xs text-ink-2">Your approval is signed in your name and cannot be taken back.</p>}

      <Sheet open={declineOpen} onClose={() => setDeclineOpen(false)} title="Decline this proposal?"
        footer={<Button tone="danger" className="w-full" busy={cast.isPending} onClick={() => act('decline')}>Decline and sign</Button>}>
        <p className="text-[15px]">{proposalTitle(p, names)}</p>
        <p className="mt-2 text-sm text-ink-2">
          {p.tier === 'pair' ? 'Below the limit, one decline from the treasurer or the secretary closes it.'
            : `It closes once too few members remain to reach ${p.required}.`} Your decline is signed and stays on the record.
        </p>
      </Sheet>
    </Card>
  )
}

function Body({ p, limitNow }: { p: ProposalRow; limitNow: number | undefined }) {
  const names = useNames()
  const line = (() => {
    switch (p.action) {
      case 'expense':
      case 'receipt':
        return <Facts items={[categoryLabel(p.category), day(p.business_date), p.narration]} />
      case 'charge':
        return <Facts items={[`${p.flat_count} flats`, p.flat_set === 'parking' ? 'Flats with parking' : 'Every flat', day(p.business_date)]} />
      case 'reversal':
        return <>Reverses <Link to="/entry/$seq" params={{ seq: String(p.target_seq) }} className="font-medium text-accent">#{p.target_seq}</Link>{p.replacement_amount_minor ? <>, replaced by {format(p.replacement_amount_minor)}</> : null}. {p.reason}</>
      case 'limit_change':
        return <>From {format(limitNow ?? p.limit_minor, 'INR', { compact: true })} to {format(p.amount_minor ?? 0, 'INR', { compact: true })}. {p.narration}</>
      case 'seat_admin':
        return <>{names.get(p.person ?? '')} as {roleLabel[p.role ?? 'member']}. {p.narration}</>
      case 'appoint_auditor':
        return <>For FY {p.fy}. {p.narration}</>
      default:
        return p.narration
    }
  })()
  return <p className="mt-2 text-sm leading-relaxed text-ink-2">{line}</p>
}

/** A month of maintenance receipts is routine; one sheet signs them all, each separately. */
function BulkReceipts({ items }: { items: ProposalRow[] }) {
  const cast = useCast()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(0)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    setDone(0)
    let failed = 0
    for (const p of items) {
      try { await cast.mutateAsync({ seq: p.seq, decision: 'approve' }) } catch { failed++ }
      setDone((d) => d + 1)
    }
    setBusy(false)
    setOpen(false)
    toast(failed ? `${items.length - failed} approved, ${failed} could not be.` : `${plural(items.length, 'receipt')} approved.`, failed ? 'error' : 'ok')
  }
  return (
    <>
      <button onClick={() => setOpen(true)} className="mb-4 flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-line-strong/40 px-4 py-3 text-left text-sm hover:bg-sunken">
        <CheckCheck className="size-5 text-accent" />
        <span className="flex-1"><span className="font-medium">{plural(items.length, 'maintenance receipt')}</span> waiting. Review and approve together.</span>
      </button>
      <Sheet open={open} onClose={() => !busy && setOpen(false)} title={`Approve ${plural(items.length, 'receipt')}`}
        footer={<Button tone="primary" className="w-full" busy={busy} onClick={run}>{busy ? `Signing ${done} of ${items.length}` : `Sign all ${items.length}`}</Button>}>
        <ul className="divide-y divide-line">
          {items.map((p) => (
            <li key={p.seq} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0"><span className="block truncate font-medium">{p.counterparty}</span><span className="text-xs text-ink-2">{day(p.business_date)} · {p.narration}</span></span>
              <Amount minor={p.amount_minor ?? 0} signed tone="auto" />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-2">Each is signed as its own approval.</p>
      </Sheet>
    </>
  )
}

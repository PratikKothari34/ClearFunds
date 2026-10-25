import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Eye, Flag, MessageSquare, Plus, UserRound } from 'lucide-react'
import { resolveHandle, useDisputes, useFlagNote, useNames, useSociety, useTenantFlags } from '../lib/api'
import { Refused } from '../lib/supabase'
import { useMeStrict, isCommittee } from '../lib/session'
import { daysOpen, instant, month, plural } from '../lib/format'
import { Button, Chip, Empty, Facts, Failed, Loading, PageTitle, Segmented, Sheet, Textarea, useToast, cx } from '../components/ui'
import { RaiseDispute } from '../components/RaiseDispute'
import type { DisputeRow, Me } from '../lib/types'

export const Route = createFileRoute('/disputes')({ component: Disputes })

type Tab = 'open' | 'resolved' | 'mine'

function who(d: DisputeRow, me: Me, tenantFlags: Set<number> | undefined) {
  if (me.tenure?.handle === d.handle) return 'You'
  if (tenantFlags?.has(d.seq)) return 'Your tenant'
  // Never the handle itself: a stable code on a shared screen is a
  // behavioural fingerprint, and a tenant's must not appear at all.
  return 'A resident'
}

function about(d: DisputeRow) {
  if (d.scope === 'entries') return d.target_seqs.length === 1 ? `Entry #${d.target_seqs[0]}` : `${d.target_seqs.length} entries`
  if (d.scope === 'counterparty') return `Payee: ${d.counterparty}`
  return d.period && d.period.length === 7 && d.period[4] === '-' && Number(d.period.slice(5)) <= 12 ? month(d.period) : `FY ${d.period}`
}

function Disputes() {
  const me = useMeStrict()
  const disputes = useDisputes()
  const tenantFlags = useTenantFlags()
  const [tab, setTab] = useState<Tab>('open')
  const [raise, setRaise] = useState(false)
  const [open, setOpen] = useState<number | null>(null)

  const all = useMemo(() => (disputes.data ?? []).toReversed(), [disputes.data])
  const lists = {
    open: all.filter((d) => d.is_open),
    resolved: all.filter((d) => !d.is_open),
    mine: all.filter((d) => d.handle === me.tenure?.handle || tenantFlags.data?.has(d.seq)),
  }
  // Distinct residents, not flags: one angry resident is not a crowd.
  const residents = new Set(lists.open.map((d) => d.handle)).size
  const current = all.find((d) => d.seq === open)

  return (
    <div>
      <PageTitle title="Disputes"
        sub={disputes.data ? `${plural(lists.open.length, 'open dispute')} from ${plural(residents, 'resident')}` : ' '}
        action={me.tenure && <Button tone="primary" icon={<Plus className="size-4" />} onClick={() => setRaise(true)}>Raise</Button>} />
      <Segmented<Tab> className="mb-4" label="Disputes" value={tab} onChange={setTab}
        options={[
          { value: 'open', label: 'Open', count: lists.open.length },
          { value: 'resolved', label: 'Resolved' },
          ...(me.tenure ? [{ value: 'mine' as const, label: me.tenure.kind === 'owner' ? 'Mine and my tenant’s' : 'Mine' }] : []),
        ]} />

      {disputes.isPending ? <Loading />
        : disputes.isError ? <Failed error={disputes.error} retry={() => disputes.refetch()} />
        : !lists[tab].length ? <Empty icon={<Flag className="size-5" />} title={tab === 'open' ? 'No open disputes' : 'Nothing here'}>Any resident can question any entry. It has no effect on the money.</Empty>
        : (
          <div className="space-y-3">
            {lists[tab].map((d) => (
              <button key={d.seq} onClick={() => setOpen(d.seq)} className="card rise block w-full cursor-pointer p-4 text-left transition-colors hover:bg-sunken/50">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-ink-2"><Facts items={[about(d), who(d, me, tenantFlags.data), instant(d.recorded_at, { day: 'numeric', month: 'short' })]} /></p>
                  {d.is_open ? <Chip tone="break">{daysOpen(d.recorded_at) ? `Open ${daysOpen(d.recorded_at)} days` : 'Opened today'}</Chip> : <Chip>Resolved</Chip>}
                </div>
                <p className="mt-2 line-clamp-3 text-[15px] leading-relaxed">{d.text}</p>
                {d.notes.length > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-ink-2"><MessageSquare className="size-3.5" />{plural(d.notes.length, 'note')}</p>
                )}
              </button>
            ))}
          </div>
        )}

      {me.tenure && <RaiseDispute open={raise} onClose={() => setRaise(false)} />}
      {current && <Thread d={current} onClose={() => setOpen(null)} />}
    </div>
  )
}

function Thread({ d, onClose }: { d: DisputeRow; onClose: () => void }) {
  const me = useMeStrict()
  const s = useSociety()
  const names = useNames()
  const tenantFlags = useTenantFlags()
  const note = useFlagNote()
  const toast = useToast()
  const [text, setText] = useState('')
  const [identity, setIdentity] = useState<string | null>(null)
  const author = me.tenure?.handle === d.handle
  const committee = isCommittee(me)

  const send = async (kind: string) => {
    try {
      await note.mutateAsync({ flag: d.seq, note: kind, text })
      setText('')
      toast(kind === 'resolved' ? 'Marked resolved.' : 'Added to the record.')
    } catch (e) {
      toast(e instanceof Refused ? e.message : 'Could not add that.', 'error')
    }
  }

  return (
    <Sheet open onClose={onClose} title={about(d)} wide
      footer={d.is_open && (author || committee) ? (
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-16" placeholder={author ? 'Add a note' : 'Reply as the committee'} />
          <div className="flex flex-wrap gap-2">
            {author ? (
              <>
                <Button tone="primary" disabled={!text.trim()} busy={note.isPending} onClick={() => send('comment')}>Add note</Button>
                <Button onClick={() => send('resolved')} busy={note.isPending}>I’m satisfied</Button>
                <Button tone="ghost" onClick={() => send('raised_in_error')} busy={note.isPending}>Raised in error</Button>
              </>
            ) : (
              <Button tone="primary" disabled={!text.trim()} busy={note.isPending} onClick={() => send('response')}>Reply</Button>
            )}
          </div>
          {committee && !author && <p className="text-xs text-ink-2">Replying does not close it or pause its clock. Only the resident who raised it can.</p>}
        </div>
      ) : undefined}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-sunken p-4">
          <p className="text-xs text-ink-2"><Facts items={[who(d, me, tenantFlags.data), instant(d.recorded_at), `#${d.seq}`]} /></p>
          <p className="mt-2 text-[15px] leading-relaxed">{d.text}</p>
          {d.scope === 'entries' && (
            <div className="mt-3 flex flex-wrap gap-2">
              {d.target_seqs.map((t) => <Link key={t} to="/entry/$seq" params={{ seq: String(t) }} className="text-sm font-medium text-accent">See #{t}</Link>)}
            </div>
          )}
          {d.scope === 'counterparty' && <Link to="/ledger" search={{ q: d.counterparty ?? '' }} className="mt-3 inline-block text-sm font-medium text-accent">See payments to {d.counterparty}</Link>}
        </div>

        {committee && (
          identity ? <p className="flex items-center gap-2 text-sm"><UserRound className="size-4 text-ink-2" />{identity}</p>
            : <button className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-ink-2 hover:text-ink" onClick={async () => {
                const r = await resolveHandle(s.id, d.handle).catch(() => null)
                setIdentity(r ? `${r.name}, ${r.kind} of ${r.flat}${r.ended ? ' (tenure ended)' : ''}` : 'Could not look this up.')
              }}><Eye className="size-4" />See who raised this</button>
        )}

        <ol className="space-y-3">
          {d.notes.map((n) => (
            <li key={n.seq} className={cx('rounded-2xl p-3.5 text-sm', n.by_author ? 'bg-accent-soft' : 'border border-line')}>
              <p className="text-xs text-ink-2">
                <Facts items={[n.by_author ? who(d, me, tenantFlags.data) : `${names.get(n.by) ?? 'Committee'}, committee`, instant(n.recorded_at),
                  n.note === 'resolved' ? 'Marked resolved' : n.note === 'raised_in_error' ? 'Raised in error' : null]} />
              </p>
              <p className="mt-1 leading-relaxed">{n.text}</p>
            </li>
          ))}
        </ol>
        {!d.notes.length && <p className="text-sm text-ink-2">No replies yet. Open {daysOpen(d.recorded_at)} days.</p>}
      </div>
    </Sheet>
  )
}

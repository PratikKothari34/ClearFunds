import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Gavel, Scale, UserMinus, UserPlus, Users } from 'lucide-react'
import { useAddResident, useCommittee, useLimit, usePropose, useSociety, useYears } from '../lib/api'
import { supabase, unwrap, Refused } from '../lib/supabase'
import { useMeStrict, isCommittee } from '../lib/session'
import { instant, roleLabel, todayIST, fyOf } from '../lib/format'
import { format, parse } from '../lib/money'
import { Avatar, Button, Caption, Card, Chip, Field, Input, Loading, MoneyInput, PageTitle, Segmented, Sheet, useToast } from '../components/ui'
import type { Role } from '../lib/types'

export const Route = createFileRoute('/committee')({ component: Committee })

const order: Role[] = ['president', 'treasurer', 'secretary', 'member']

type Action = null | 'limit' | 'seat' | 'auditor' | 'resident' | { unseat: string }

function Committee() {
  const me = useMeStrict()
  const c = useCommittee()
  const limit = useLimit()
  const years = useYears()
  const [action, setAction] = useState<Action>(null)
  const active = useMemo(() => (c.data?.seats ?? []).filter((s) => s.unseated_seq === null)
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)), [c.data])
  const name = (id: string) => c.data?.people.find((p) => p.id === id)?.full_name ?? 'Member'
  const m = active.length
  const need = Math.max(Math.ceil((2 * m) / 3), 2)
  const lim = limit.data?.current.limit_minor
  const mine = isCommittee(me)

  return (
    <div>
      <PageTitle title="Committee" sub={`${m} seated. No one moves money alone.`} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><Users className="size-4" />At or below {lim !== undefined ? format(lim, 'INR', { compact: true }) : '…'}</div>
          <p className="mt-2 text-xl font-semibold tracking-tight">Treasurer + Secretary</p>
          <p className="mt-1 text-[13px] text-ink-2">Both, never either alone.</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2"><Scale className="size-4" />Above it, and to change it</div>
          <p className="mt-2 text-xl font-semibold tracking-tight">{need} of {m} members</p>
          <div className="mt-2 flex gap-1" aria-hidden>
            {Array.from({ length: m }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < need ? 'bg-accent' : 'bg-line'}`} />)}
          </div>
          <p className="mt-2 text-[13px] text-ink-2">Two-thirds, rounded up. Fixed when the first approval is cast.</p>
        </Card>
      </div>

      {mine && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" icon={<Scale className="size-4" />} onClick={() => setAction('limit')}>Change limit</Button>
          <Button size="sm" icon={<UserPlus className="size-4" />} onClick={() => setAction('seat')}>Seat a member</Button>
          <Button size="sm" icon={<Gavel className="size-4" />} onClick={() => setAction('auditor')}>Appoint auditor</Button>
          <Button size="sm" icon={<UserPlus className="size-4" />} onClick={() => setAction('resident')}>Add resident</Button>
        </div>
      )}

      <Caption className="mt-6">Seated</Caption>
      {c.isPending ? <Loading /> : (
        <Card className="divide-y divide-line">
          {active.map((s) => (
            <div key={s.person_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={name(s.person_id)} tone={s.role !== 'member' ? 'accent' : 'neutral'} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{name(s.person_id)}{s.person_id === me.person && <span className="text-ink-2"> (you)</span>}</p>
                <p className="text-[13px] text-ink-2">{roleLabel[s.role]}</p>
              </div>
              {s.derived && <Chip tone="attention">Emergency seat</Chip>}
              {mine && s.person_id !== me.person && (
                <button className="grid size-9 cursor-pointer place-items-center rounded-lg text-ink-2 hover:bg-sunken hover:text-break" aria-label={`Propose unseating ${name(s.person_id)}`}
                  onClick={() => setAction({ unseat: s.person_id })}><UserMinus className="size-4" /></button>
              )}
            </div>
          ))}
        </Card>
      )}
      {active.some((s) => s.derived) && <p className="mt-2 px-1 text-xs text-ink-2">An emergency seat cannot vote to seat further members. It counts for everything else.</p>}

      <Caption className="mt-6">Auditors</Caption>
      <Card className="divide-y divide-line">
        {(years.data ?? []).filter((y) => y.auditor?.length).map((y) => (
          <div key={y.fy} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={y.auditor![0]!.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{y.auditor!.map((a) => a.name).join(', ')}</p>
              <p className="text-[13px] text-ink-2">FY {y.fy}</p>
            </div>
            <Chip tone={y.closed ? 'anchor' : 'neutral'}>{y.closed ? 'Year closed' : 'Open'}</Chip>
          </div>
        ))}
        {!(years.data ?? []).some((y) => y.auditor?.length) && <p className="p-4 text-sm text-ink-2">No auditor appointed yet.</p>}
      </Card>

      <Caption className="mt-6">Limit history</Caption>
      <Card className="divide-y divide-line">
        {(limit.data?.history ?? []).toReversed().map((h, i) => (
          <div key={h.seq} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-ink-2">{i === 0 ? 'In force since' : 'From'} {instant(h.recorded_at, { day: 'numeric', month: 'short', year: 'numeric' })} · #{h.seq}</span>
            <span className="tnum font-medium">{format(h.limit_minor, 'INR', { compact: true })}</span>
          </div>
        ))}
      </Card>

      {mine && <Actions action={action} onClose={() => setAction(null)} name={name} lim={lim} />}
    </div>
  )
}

function Actions({ action, onClose, name, lim }: { action: Action; onClose: () => void; name: (id: string) => string; lim: number | undefined }) {
  const s = useSociety()
  const propose = usePropose()
  const add = useAddResident()
  const toast = useToast()
  const c = useCommittee()
  const [amount, setAmount] = useState('')
  const [person, setPerson] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [fy, setFy] = useState(() => fyOf(todayIST(), s.fy_start_month))
  const [why, setWhy] = useState('')
  const [res, setRes] = useState({ name: '', email: '', phone: '', flat: '', kind: 'owner' as 'owner' | 'tenant' })
  const [error, setError] = useState<string | null>(null)

  const flats = useQuery({
    queryKey: ['flats', s.id], enabled: action === 'resident',
    queryFn: async () => unwrap(await supabase.from('flats').select('id,label,ordinal').eq('society_id', s.id).order('ordinal')),
  })
  const seated = new Set((c.data?.seats ?? []).filter((x) => x.unseated_seq === null).map((x) => x.person_id))
  const candidates = (c.data?.people ?? []).filter((p) => !seated.has(p.id)).toSorted((a, b) => a.full_name.localeCompare(b.full_name))

  const go = async (p: Record<string, string | number | null | undefined>) => {
    setError(null)
    try {
      const out = await propose.mutateAsync(p)
      toast(out.status === 'posted' ? 'Done.' : 'Proposed. The committee votes on it in Approvals.')
      onClose()
    } catch (e) {
      setError(e instanceof Refused ? e.message : 'Could not propose it.')
    }
  }

  if (!action) return null
  if (action === 'resident') {
    return (
      <Sheet open onClose={onClose} title="Add a resident"
        footer={<Button tone="primary" className="w-full" busy={add.isPending} disabled={!res.name || !res.email || !res.flat}
          onClick={async () => {
            setError(null)
            try { await add.mutateAsync({ ...res, ...(res.phone ? { phone: res.phone } : {}) }); toast('Added. They can sign in with that email.'); onClose() }
            catch (e) { setError(e instanceof Refused ? e.message : 'Could not add them.') }
          }}>Add resident</Button>}>
        <div className="space-y-4">
          <Segmented<'owner' | 'tenant'> label="Kind" value={res.kind} onChange={(k) => setRes({ ...res, kind: k })}
            options={[{ value: 'owner', label: 'Owner' }, { value: 'tenant', label: 'Tenant' }]} />
          <Field label="Name" htmlFor="rn"><Input id="rn" value={res.name} onChange={(e) => setRes({ ...res, name: e.target.value })} /></Field>
          <Field label="Email" htmlFor="re"><Input id="re" type="email" value={res.email} onChange={(e) => setRes({ ...res, email: e.target.value })} /></Field>
          <Field label="Phone" htmlFor="rp"><Input id="rp" type="tel" value={res.phone} onChange={(e) => setRes({ ...res, phone: e.target.value })} /></Field>
          <Field label="Flat" htmlFor="rf" error={error}>
            <select id="rf" value={res.flat} onChange={(e) => setRes({ ...res, flat: e.target.value })} className="h-12 w-full rounded-xl border border-line bg-surface px-3">
              <option value="">Choose</option>
              {flats.data?.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </Field>
          {res.kind === 'tenant' && <p className="rounded-xl bg-sunken p-3 text-[13px] text-ink-2">The tenant gets their own account. The flat’s owner can see disputes the tenant raises, and the tenant is told so.</p>}
        </div>
      </Sheet>
    )
  }

  const title = action === 'limit' ? 'Change the approval limit' : action === 'seat' ? 'Seat a member' : action === 'auditor' ? 'Appoint an auditor' : `Unseat ${name(action.unseat)}`
  const minor = parse(amount)
  const ready = action === 'limit' ? minor !== null && why.trim() : action === 'seat' || action === 'auditor' ? person && why.trim() : why.trim()
  return (
    <Sheet open onClose={onClose} title={title}
      footer={<Button tone="primary" className="w-full" busy={propose.isPending} disabled={!ready}
        onClick={() => action === 'limit' ? go({ action: 'limit_change', amount_minor: minor, narration: why })
          : action === 'seat' ? go({ action: 'seat_admin', person, role, narration: why })
          : action === 'auditor' ? go({ action: 'appoint_auditor', person, fy, narration: why })
          : go({ action: 'unseat_admin', person: action.unseat, narration: why })}>Propose</Button>}>
      <div className="space-y-4">
        {action === 'limit' && (
          <Field label="New limit" htmlFor="lim" hint={`Now ${lim !== undefined ? format(lim, 'INR', { compact: true }) : '…'}. Zero sends every entry to the committee.`}>
            <MoneyInput id="lim" value={amount} onChange={setAmount} autoFocus />
          </Field>
        )}
        {(action === 'seat' || action === 'auditor') && (
          <Field label="Person" htmlFor="per" hint={action === 'auditor' ? 'Not a committee member. Add them as a person first if needed.' : undefined}>
            <select id="per" value={person} onChange={(e) => setPerson(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-surface px-3">
              <option value="">Choose</option>
              {candidates.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </Field>
        )}
        {action === 'seat' && (
          <Field label="Role">
            <Segmented<Role> label="Role" value={role} onChange={setRole}
              options={order.map((r) => ({ value: r, label: r === 'member' ? 'Member' : roleLabel[r] }))} />
          </Field>
        )}
        {action === 'auditor' && <Field label="Financial year" htmlFor="fy"><Input id="fy" value={fy} onChange={(e) => setFy(e.target.value)} placeholder="2026-27" /></Field>}
        <Field label="Reason" htmlFor="why" error={error}><Input id="why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Recorded with the vote" /></Field>
        <p className="text-[13px] text-ink-2">This is a committee vote. It is recorded with the limit and the count in force when the first vote is cast.</p>
      </div>
    </Sheet>
  )
}

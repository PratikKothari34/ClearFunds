import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Check, PenLine } from 'lucide-react'
import { useNames, useSignoff, useSignoffs, useSummary } from '../lib/api'
import { Refused } from '../lib/supabase'
import { useMeStrict } from '../lib/session'
import { instant, month, todayIST } from '../lib/format'
import { Amount, Button, Card, Chip, Field, Input, Loading, PageTitle, Sheet, useToast, cx } from '../components/ui'
import { recentMonths } from '../components/Shell'

export const Route = createFileRoute('/sign-off')({ component: SignOff })

function SignOff() {
  const me = useMeStrict()
  const signoffs = useSignoffs()
  const summary = useSummary()
  const names = useNames()
  const [open, setOpen] = useState<string | null>(null)
  const cur = todayIST().slice(0, 7)
  const months = recentMonths(cur, 12)
  const done = new Map((signoffs.data ?? []).map((s) => [s.body.month, s]))
  const totals = new Map((summary.data?.months ?? []).map((m) => [m.month, m]))
  const president = me.seat?.role === 'president'

  return (
    <div>
      <PageTitle title="Monthly sign-off" sub="The president’s final say on each month’s expense sheet. It does not close the year." />
      {signoffs.isPending ? <Loading /> : (
        <Card className="divide-y divide-line">
          {months.map((m) => {
            const s = done.get(m)
            const t = totals.get(m)
            const due = president && !s && m < cur
            return (
              <div key={m} className={cx('flex items-center gap-3 px-4 py-3.5', due && 'bg-attention-soft/40')}>
                <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl', s ? 'bg-anchor-soft text-anchor' : due ? 'bg-attention-soft text-attention' : 'bg-sunken text-ink-2')}>
                  {s ? <Check className="size-4" strokeWidth={2.5} /> : <PenLine className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{month(m)}</p>
                  <p className="truncate text-[13px] text-ink-2">
                    {s ? `Signed by ${names.get(s.actor) ?? 'the president'}, ${instant(s.recorded_at)}` : m === cur ? 'In progress' : t ? 'Not signed' : 'No entries'}
                  </p>
                </div>
                {t && <span className="hidden text-right text-xs sm:block"><Amount minor={t.out_minor} size="sm" className="text-debit" /><span className="block text-ink-2">spent</span></span>}
                {due ? <Button size="sm" tone="primary" onClick={() => setOpen(m)}>Sign</Button> : s ? <Chip tone="anchor">Signed</Chip> : null}
              </div>
            )
          })}
        </Card>
      )}
      {open && <SignSheet m={open} onClose={() => setOpen(null)} t={totals.get(open)} />}
    </div>
  )
}

function SignSheet({ m, onClose, t }: { m: string; onClose: () => void; t: { in_minor: number; out_minor: number; entries: number } | undefined }) {
  const sign = useSignoff()
  const toast = useToast()
  const [note, setNote] = useState('')
  return (
    <Sheet open onClose={onClose} title={`Sign off ${month(m)}`}
      footer={<Button tone="primary" className="w-full" busy={sign.isPending} onClick={async () => {
        try { await sign.mutateAsync({ month: m, ...(note ? { note } : {}) }); toast(`${month(m)} signed off.`); onClose() }
        catch (e) { toast(e instanceof Refused ? e.message : 'Could not sign.', 'error') }
      }}>Sign in my name</Button>}>
      {t && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-sunken p-3"><Amount minor={t.in_minor} size="sm" className="font-semibold text-credit" /><p className="text-xs text-ink-2">In</p></div>
          <div className="rounded-xl bg-sunken p-3"><Amount minor={t.out_minor} size="sm" className="font-semibold text-debit" /><p className="text-xs text-ink-2">Out</p></div>
          <div className="rounded-xl bg-sunken p-3"><p className="tnum text-sm font-semibold">{t.entries}</p><p className="text-xs text-ink-2">Entries</p></div>
        </div>
      )}
      <Link to="/ledger" className="mt-3 inline-block text-sm font-medium text-accent">Review the month in the ledger</Link>
      <div className="mt-4"><Field label="Note (optional)" htmlFor="n"><Input id="n" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      <p className="mt-3 text-[13px] text-ink-2">Your signature covers the record as it stands now, by its latest fingerprint.</p>
    </Sheet>
  )
}

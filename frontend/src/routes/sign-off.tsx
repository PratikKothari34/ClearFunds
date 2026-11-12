import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Check, PenLine } from 'lucide-react'
import { useNames, useSignoff, useSignoffs, useSummary } from '../lib/api'
import { Refused } from '../lib/supabase'
import { useMeStrict, useCurrency } from '../lib/session'
import { instant, month, monthOf, todayIST } from '../lib/format'
import { isDue, signoffMonths } from '../lib/signoff'
import { Amount, Button, Card, Chip, Failed, Field, Input, Loading, PageTitle, ReversedNote, Sheet, useToast, cx } from '../components/ui'
import { recentMonths } from '../components/Shell'
import { monthHasReversal as monthReversal, reversedIn, reversedOut } from '../lib/reversed'
import type { Summary } from '../lib/types'

export const Route = createFileRoute('/sign-off')({ component: SignOff })

function SignOff() {
  const ccy = useCurrency()
  const me = useMeStrict()
  const signoffs = useSignoffs()
  const summary = useSummary()
  const names = useNames()
  const [open, setOpen] = useState<string | null>(null)
  const cur = monthOf(todayIST())
  const done = new Map((signoffs.data ?? []).map((s) => [s.body.month, s]))
  const totals = new Map((summary.data?.months ?? []).map((m) => [m.month, m]))
  /*
   * The month set is DERIVED FROM DATA, not generated from today. A rolling
   * window dropped an older unsigned month entirely - see lib/signoff.ts. The
   * rolling window survives only as a floor, so the screen is never blank
   * before the summary resolves, and it can only add months, never remove one.
   */
  const months = signoffMonths([...totals.keys()], [...done.keys()], recentMonths(cur, 12))
  const president = me.seat?.role === 'president'

  return (
    <div>
      <PageTitle title="Monthly sign-off" sub="The president’s final say on each month’s expense sheet. It does not close the year." />
      {/*
        * A failed read must not render as a list of unsigned months. `done`
        * is built from `signoffs.data ?? []`, so losing that read empties it
        * and every month then draws as outstanding - the president is shown
        * work that may already be done, which is the inverse of the
        * oldest-month bug this screen has already paid for once. The summary
        * read is separate and only supplies totals, so this gates on the
        * sign-off read alone.
        */}
      {signoffs.isPending ? <Loading />
        : signoffs.isError ? <Failed error={signoffs.error} retry={() => signoffs.refetch()} /> : (
        <Card className="divide-y divide-line">
          {months.map((m) => {
            const s = done.get(m)
            const t = totals.get(m)
            const due = president && isDue(m, cur, new Set(done.keys()))
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
                {/*
                  * Labelled "out", not "spent". `out_minor` carries reversals
                  * gross, and a reversed RECEIPT is money out that was never
                  * spending - so "spent" is false for any month holding one,
                  * on the screen the president reads immediately before an
                  * irreversible signature. There is no arithmetic fix in this
                  * lane: the figure is right and the word was wrong, so the
                  * word changes to the one the figure supports.
                  */}
                {t && (
                  <span className="hidden text-right text-xs sm:block">
                    <Amount currency={ccy} minor={t.out_minor} size="sm" className="text-debit" />
                    <span className="block text-ink-2">
                      out{monthReversal(t) === 'none' ? '' : monthReversal(t) === 'unknown' ? ', may include corrections' : ', includes corrections'}
                    </span>
                  </span>
                )}
                {due ? <Button tone="primary" onClick={() => setOpen(m)}>Sign</Button> : s ? <Chip tone="anchor">Signed</Chip> : null}
              </div>
            )
          })}
        </Card>
      )}
      {open && <SignSheet m={open} onClose={() => setOpen(null)} t={totals.get(open)} />}
    </div>
  )
}

/*
 * `t` is the whole month row, not a three-key narrowing of it. The narrowed
 * shape could not carry the reversed keys, and this is the surface that most
 * needs them: the president signs here, and a signature cannot be withdrawn.
 */
function SignSheet({ m, onClose, t }: { m: string; onClose: () => void; t: Summary['months'][number] | undefined }) {
  const ccy = useCurrency()
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
          <div className="rounded-xl bg-sunken p-3">
            <Amount currency={ccy} minor={t.in_minor} size="sm" className="font-semibold text-credit" />
            <p className="text-xs text-ink-2">In</p>
            <ReversedNote currency={ccy} of={reversedIn(t)} className="mt-1" />
          </div>
          <div className="rounded-xl bg-sunken p-3">
            <Amount currency={ccy} minor={t.out_minor} size="sm" className="font-semibold text-debit" />
            <p className="text-xs text-ink-2">Out</p>
            <ReversedNote currency={ccy} of={reversedOut(t)} className="mt-1" />
          </div>
          <div className="rounded-xl bg-sunken p-3"><p className="tnum text-sm font-semibold">{t.entries}</p><p className="text-xs text-ink-2">Entries</p></div>
        </div>
      )}
      <Link to="/ledger" className="mt-3 inline-block text-sm font-medium text-accent">Review the month in the ledger</Link>
      <div className="mt-4"><Field label="Note (optional)" htmlFor="n"><Input id="n" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      <p className="mt-3 text-[13px] text-ink-2">Your signature covers the record as it stands now, by its latest fingerprint.</p>
    </Sheet>
  )
}

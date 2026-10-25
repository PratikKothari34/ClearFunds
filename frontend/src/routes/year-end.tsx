import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Gavel, Lock } from 'lucide-react'
import { useCloseYear, useYears } from '../lib/api'
import { Refused } from '../lib/supabase'
import { useMeStrict } from '../lib/session'
import { instant, longDay, opinionHint, opinionLabel, opinionTone } from '../lib/format'
import { Button, Card, Caption, Chip, Empty, Field, Loading, PageTitle, Sheet, Textarea, useToast, cx } from '../components/ui'
import type { Opinion, Year } from '../lib/types'

export const Route = createFileRoute('/year-end')({ component: YearEnd })

const opinions: Opinion[] = ['clean', 'qualified', 'adverse', 'disclaimer']

function YearEnd() {
  const me = useMeStrict()
  const years = useYears()
  const list = (years.data ?? []).toReversed()
  return (
    <div>
      <PageTitle title="Year-end" sub="Only the appointed auditor closes a year. The committee cannot close its own books." />
      {years.isPending ? <Loading /> : !list.length ? <Empty icon={<Gavel className="size-5" />} title="No financial years yet" /> : (
        <div className="space-y-3">
          {list.map((y) => <YearCard key={y.fy} y={y} mine={me.auditor_for.includes(y.fy)} />)}
        </div>
      )}
    </div>
  )
}

function YearCard({ y, mine }: { y: Year; mine: boolean }) {
  const [open, setOpen] = useState(false)
  const can = mine && y.ended && !y.closed
  return (
    <Card className={cx('p-5', can && 'border-attention/30')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">FY {y.fy}</h2>
          <p className="text-[13px] text-ink-2">{longDay(y.starts)} to {longDay(y.ends)}</p>
        </div>
        {y.closed ? <Chip tone={opinionTone(y.headline)} icon={<Lock className="size-3" />}>{opinionLabel[y.headline!]}</Chip>
          : <Chip>{y.ended ? 'Ended, open' : 'In progress'}</Chip>}
      </div>
      <p className="mt-3 text-sm text-ink-2">
        {y.auditor?.length ? `Auditor: ${y.auditor.map((a) => a.name).join(', ')}` : 'No auditor appointed.'}
      </p>
      {y.history.map((h) => (
        <p key={h.seq} className="mt-2 text-[13px] text-ink-2">{opinionLabel[h.opinion]} by {h.auditor}, {instant(h.recorded_at)}</p>
      ))}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/reports"><Button size="sm">Read the statements</Button></Link>
        {can && <Button size="sm" tone="primary" icon={<Gavel className="size-4" />} onClick={() => setOpen(true)}>Give opinion and close</Button>}
      </div>
      {can && <CloseSheet y={y} open={open} onClose={() => setOpen(false)} />}
    </Card>
  )
}

function CloseSheet({ y, open, onClose }: { y: Year; open: boolean; onClose: () => void }) {
  const close = useCloseYear()
  const toast = useToast()
  const [opinion, setOpinion] = useState<Opinion | null>(null)
  const [statement, setStatement] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setError(null)
    try {
      await close.mutateAsync({ fy: y.fy, opinion: opinion!, statement })
      toast(`FY ${y.fy} is closed.`)
      onClose()
    } catch (e) {
      setError(e instanceof Refused ? e.message : 'Could not close the year.')
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Close FY ${y.fy}`} wide
      footer={<Button tone="primary" className="w-full" busy={close.isPending} disabled={!opinion || !statement.trim()} onClick={submit}>Sign and close the year</Button>}>
      <div className="space-y-5">
        <Caption className="mb-0 px-0">Opinion, least to most serious</Caption>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Opinion">
          {opinions.map((o, i) => (
            <button key={o} role="radio" aria-checked={opinion === o} onClick={() => setOpinion(o)}
              className={cx('cursor-pointer rounded-2xl border p-4 text-left transition-colors',
                opinion === o ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunken')}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{opinionLabel[o]}</span>
                <span className="flex gap-0.5" aria-hidden>{opinions.map((_, j) => <span key={j} className={cx('h-1.5 w-3 rounded-full', j <= i ? 'bg-ink-2' : 'bg-line')} />)}</span>
              </div>
              <p className="mt-1 text-[13px] text-ink-2">{opinionHint[o]}</p>
            </button>
          ))}
        </div>
        <Field label="Your statement" htmlFor="st" hint="Public and chained. There are no private notes." error={error}>
          <Textarea id="st" value={statement} onChange={(e) => setStatement(e.target.value)} className="min-h-36"
            placeholder="In my opinion… Basis for opinion…" />
        </Field>
        <ul className="space-y-1.5 text-[13px] text-ink-2">
          <li>Any opinion closes the year, including adverse and disclaimer. Closing seals it; it does not endorse it.</li>
          <li>Your opinion expresses reasonable assurance on the evidence you examined. It is not a guarantee.</li>
          <li>After closing, corrections post in the current year and are disclosed at the AGM.</li>
        </ul>
      </div>
    </Sheet>
  )
}

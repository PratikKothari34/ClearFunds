import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Gavel, Lock } from 'lucide-react'
import { useCloseYear, useYears } from '../lib/api'
import { Refused } from '../lib/supabase'
import { checkStatement } from '../lib/statement'
import { useMeStrict } from '../lib/session'
import { instant, longDay, opinionChip, opinionHint, opinionLabel, opinionTone } from '../lib/format'
import { Button, Card, Caption, Chip, Empty, Failed, Field, Loading, PageTitle, Sheet, Textarea, useToast, cx } from '../components/ui'
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
      {/*
        * The error arm comes BEFORE the empty one. `years.data ?? []` makes a
        * FAILED read indistinguishable from a society with no years, and the
        * empty state then asserts "No financial years yet" from no data - on
        * the page that gates the one irreversible action in this product. An
        * auditor who cannot see the year they were appointed to close has to
        * be told the read failed, and offered a retry, not told there is
        * nothing to close.
        */}
      {years.isPending ? <Loading />
        : years.isError ? <Failed error={years.error} retry={() => years.refetch()} />
        : !list.length ? <Empty icon={<Gavel className="size-5" />} title="No financial years yet" /> : (
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
        {y.closed ? <Chip tone={opinionTone(y.headline)} icon={<Lock className="size-3" />}>{opinionChip(y.headline)}</Chip>
          : <Chip>{y.ended ? 'Ended, open' : 'In progress'}</Chip>}
      </div>
      <p className="mt-3 text-sm text-ink-2">
        {y.auditor?.length ? `Auditor: ${y.auditor.map((a) => a.name).join(', ')}` : 'No auditor appointed.'}
      </p>
      {y.history.map((h) => (
        <p key={h.seq} className="mt-2 text-[13px] text-ink-2">{opinionLabel[h.opinion]} by {h.auditor}, {instant(h.recorded_at)}</p>
      ))}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/reports"><Button>Read the statements</Button></Link>
        {can && <Button tone="primary" icon={<Gavel className="size-4" />} onClick={() => setOpen(true)}>Give opinion and close</Button>}
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
  /*
   * Bytes, not characters: `/close-year` bounds the statement in UTF-8 bytes
   * and refuses rather than truncates. See lib/statement.ts - a character
   * count passes 16,000 Devanagari characters at three bytes each and loses
   * the whole statement at the one irreversible action in the product.
   */
  const st = checkStatement(statement)
  /*
   * The threshold is a fraction of whichever rule binds, which `st` has
   * already resolved: a Devanagari statement reaches the character ceiling
   * at a third of the bytes an English one does, and an English one reaches
   * the byte ceiling first. Comparing `used` to `max` is correct for both
   * because both are reported in the same unit.
   */
  const near = st.used > st.max * 0.9
  const submit = async () => {
    setError(null)
    /* Closing a year is irreversible, so the precondition is enforced here
     * and not only by the disabled button: a disabled attribute is a UI
     * guarantee, and this writes a seal to the chain. */
    if (!opinion) { setError('Choose an opinion before closing the year.'); return }
    /*
     * Checked here as well as on the disabled button, for the same reason the
     * opinion is: a disabled attribute is a UI guarantee and this writes a
     * seal to the chain. The server refuses it too; this is so the auditor
     * learns it before signing rather than after.
     */
    if (st.over) { setError(`Your statement is ${st.used.toLocaleString('en-IN')} ${st.unit === 'chars' ? 'characters' : 'bytes'}. The limit is ${st.max.toLocaleString('en-IN')}. Shorten it before closing the year.`); return }
    try {
      await close.mutateAsync({ fy: y.fy, opinion, statement: st.value })
      toast(`FY ${y.fy} is closed.`)
      onClose()
    } catch (e) {
      setError(e instanceof Refused ? e.message : 'Could not close the year.')
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Close FY ${y.fy}`} wide
      footer={<Button tone="primary" className="w-full" busy={close.isPending} disabled={!opinion || st.empty || st.over} onClick={submit}>Sign and close the year</Button>}>
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
            placeholder="In my opinion… Basis for opinion…" aria-describedby={near ? 'st-left' : undefined} />
          {/*
            * Shown only near the limit. A counter on a two-paragraph opinion
            * is noise that suggests brevity is wanted, and brevity is not
            * what an adverse opinion needs. It appears in time to matter and
            * is announced politely, so it does not interrupt typing.
            */}
          {/*
            * The ELEMENT is always rendered; only its CONTENT is conditional.
            * A live region has to be in the DOM before its content changes -
            * inserting a node that already carries `aria-live` is announced
            * unreliably across assistive tech, and the announcement most
            * likely to be dropped is the FIRST one: the warning that the
            * auditor is approaching the limit, at the one irreversible action
            * in this product. An empty region announces nothing, so the
            * design intent is unchanged - no counter on a short statement -
            * and the first warning is now a content change inside a region
            * that already existed.
            */}
          <p id="st-left" aria-live="polite" className={cx('mt-1.5 text-right text-xs tnum', st.over ? 'text-debit' : 'text-ink-2')}>
            {/*
              * Labelled from `st.unit`, never hardcoded. The server bounds
              * the statement two ways - bytes of UTF-8 and characters - and a
              * Devanagari statement hits the character ceiling first. Calling
              * that figure "bytes" would show the auditor a wrong number at
              * the one irreversible action here.
              */}
            {near &&
              (st.over
                ? `${(st.used - st.max).toLocaleString('en-IN')} ${st.unit === 'chars' ? 'characters' : 'bytes'} over the limit`
                : `${(st.max - st.used).toLocaleString('en-IN')} ${st.unit === 'chars' ? 'characters' : 'bytes'} left`)}
          </p>
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

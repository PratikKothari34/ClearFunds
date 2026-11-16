import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Check, CircleDashed, Globe, Link2, Loader2, PenLine, Smartphone, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociety } from '../lib/api'
import { useMeStrict } from '../lib/session'
import { anchorUrl, lastCheck, runCheck, stepsView, verdict, type Check as CheckT, type Step } from '../lib/verify'
import { anchorRow } from '../lib/anchorfact'
import { instant, plural } from '../lib/format'
import { Button, Card, Caption, Fingerprint, PageTitle, Textarea, useToast, cx } from '../components/ui'

export const Route = createFileRoute('/verify')({ component: Verify })

type Live = Partial<Record<Step, [number, number]>>

function Verify() {
  const s = useSociety()
  const [check, setCheck] = useState<CheckT | null>(() => lastCheck(s.id))
  const [live, setLive] = useState<Live | null>(null)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  const run = async () => {
    setLive({})
    setError(null)
    try {
      const c = await runCheck(s.id, (step, done, total) => setLive((l) => ({ ...l, [step]: [done, total] })))
      setCheck(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The check could not finish.')
    } finally {
      setLive(null)
    }
  }
  useEffect(() => {
    if (started.current) return
    started.current = true
    run()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const v = check && !live ? verdict(check) : null
  /*
   * A failed run still holds the cached check, so the Steps must not redraw
   * its findings as the result of the run that just failed. `stale` keeps
   * them - they are true of their own date - and dates them.
   */
  const view = stepsView(check, { running: !!live, failed: !!error })
  const steps = view.show === 'current' || view.show === 'stale' ? check : null
  const staleAt = view.show === 'stale' ? view.at : null
  /*
   * Computed once, and already an absolute http(s) URL or null.
   * This block previously called anchorUrl(s.id) three times, asserted
   * non-null twice, and built a `new URL()` DURING RENDER to get the host.
   * new URL() throws TypeError on a relative path, and there is no error
   * boundary anywhere in the tree, so a misconfigured VITE_ANCHOR_URL
   * blanked the whole verify screen - the one screen whose job is to say
   * whether the record can be trusted.
   */
  const anchor = anchorUrl(s.id)

  return (
    <div>
      <PageTitle title="Check the record" sub="Your phone recomputes every fingerprint itself. It does not take the server's word."
        action={<Button onClick={run} busy={!!live} disabled={!!live}>Run again</Button>} />

      {v && (
        <Card className={cx('rise mb-6 flex items-start gap-4 p-5',
          v.tone === 'ok' && 'border-anchor/30 bg-anchor-soft', v.tone === 'break' && 'border-break/30 bg-break-soft')}>
          <span className={cx('grid size-11 shrink-0 place-items-center rounded-2xl',
            v.tone === 'ok' ? 'bg-anchor text-surface' : v.tone === 'break' ? 'bg-break text-surface' : 'bg-sunken text-ink-2')}>
            {v.tone === 'break' ? <AlertTriangle className="size-5" /> : v.tone === 'ok' ? <Globe className="size-5" /> : <Smartphone className="size-5" />}
          </span>
          <div className="min-w-0">
            <p className={cx('text-[17px] font-semibold tracking-tight', v.tone === 'break' && 'text-break')}>{v.line}</p>
            {/*
              * "chain entries", not "entries": this counts EVERY record in the
              * chain - approvals, appointments, flags, resolutions, opinions -
              * while the home card counts money postings alone. Both said
              * "entries" and the two figures differ by thousands, which reads
              * as the ledger concealing records from the reader rather than as
              * two counts of different things.
              */}
            <p className="mt-1 text-sm text-ink-2">{plural(check!.entries, 'chain entry', 'chain entries')} checked {instant(check!.at)}</p>
          </div>
        </Card>
      )}
      {error && <Card className="mb-6 p-5 text-sm text-break">{error}</Card>}

      <Caption>{staleAt === null ? 'Steps' : `Steps — from the last completed check, ${instant(staleAt)}`}</Caption>
      <Card className="divide-y divide-line">
        <Row stale={staleAt !== null} icon={<Link2 className="size-4" />} title="Every entry links to the one before"
          live={live?.fingerprints ?? live?.download} running={!!live && !live.signatures}
          result={steps ? (steps.chain === 'ok'
            ? { ok: true, text: `${plural(steps.entries, 'fingerprint')} recomputed. No gaps, no broken links.` }
            : { ok: false, text: steps.chain.failed }) : null} />
        <Row stale={staleAt !== null} icon={<PenLine className="size-4" />} title="Every approval is signed by its approver"
          live={live?.signatures} running={!!live?.signatures && !live.device}
          result={steps ? (steps.signatures.failed.length === 0
            ? { ok: true, text: `${plural(steps.signatures.checked, 'signature')} match the keys registered in the record.` }
            : { ok: false, text: `Entries ${steps.signatures.failed.slice(0, 5).join(', ')}${steps.signatures.failed.length > 5 ? '…' : ''} do not match.` }) : null} />
        <Row stale={staleAt !== null} icon={<Smartphone className="size-4" />} title="Nothing this phone saw has changed"
          running={!!live?.device && !live.anchor}
          result={steps ? (steps.device === 'first'
            ? { ok: null, text: 'First check on this phone. Nothing earlier to compare against yet.' }
            : steps.device === 'consistent'
              ? { ok: true, text: 'Everything seen on earlier checks is unchanged.' }
              : { ok: false, text: `Entry ${steps.device.changed} is different from what this phone saw before.` }) : null} />
        <Row stale={staleAt !== null} icon={<Globe className="size-4" />} title="Matches the fingerprint published outside the committee"
          running={!!live?.anchor}
          result={steps ? anchorRow(steps.anchor, steps.anchorHead, steps.head.seq, instant) : null} />
      </Card>

      {check && !live && (
        <>
          <Caption className="mt-6">Where the record stands</Caption>
          <Card className="space-y-3 p-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink-2">Latest entry</span><span className="tnum font-medium">#{check.head.seq}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-ink-2">Its fingerprint</span><Fingerprint value={check.head.hash} />
            </div>
            {anchor && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink-2">Published at</span>
                <a className="truncate text-accent" href={anchor.href} target="_blank" rel="noreferrer">{anchor.host}</a>
              </div>
            )}
          </Card>
          <p className="mt-4 px-1 text-[13px] text-ink-2">
            Tamper-evident, not tamper-proof: a change cannot be made quietly, but whoever runs the server could rebuild the whole record. The published fingerprint is what catches that.
          </p>
          {verdict(check).tone === 'break' && <ReportMismatch check={check} />}
        </>
      )}
    </div>
  )
}

function Row({ icon, title, live, running, result, stale }: {
  icon: React.ReactNode
  title: string
  live?: [number, number] | undefined
  running?: boolean
  result: { ok: boolean | null; text: string } | null
  /*
   * The result is from an earlier check, not the run that just failed. A
   * finding stays visible - it was true when it was made - but a PASS must
   * stop reading as current, so the tick drops to the neutral mark. A red
   * X is left alone: a failure found earlier is not made less true by a
   * later run failing to repeat it.
   */
  stale?: boolean
}) {
  const ok = stale && result?.ok === true ? null : (result?.ok ?? null)
  return (
    <div className="flex items-start gap-3 p-4">
      <span className={cx('grid size-8 shrink-0 place-items-center rounded-full',
        ok === true ? 'bg-anchor-soft text-anchor' : ok === false ? 'bg-break-soft text-break' : 'bg-sunken text-ink-2')}>
        {running ? <Loader2 className="size-4 animate-spin" /> : ok === true ? <Check className="size-4" strokeWidth={2.5} /> : ok === false ? <X className="size-4" strokeWidth={2.5} /> : result ? <CircleDashed className="size-4" /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{title}</p>
        {running && live && <p className="tnum mt-0.5 text-[13px] text-ink-2">{live[0].toLocaleString('en-IN')}{live[1] > live[0] ? ` of ${live[1].toLocaleString('en-IN')}` : ''}</p>}
        {result && <p className={cx('mt-0.5 text-[13px]', ok === false ? 'text-break' : 'text-ink-2')}>{result.text}</p>}
      </div>
    </div>
  )
}

/** One open report per resident, updated rather than duplicated. */
function ReportMismatch({ check }: { check: CheckT }) {
  const me = useMeStrict()
  const s = useSociety()
  const toast = useToast()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (!me.tenure) return null
  return (
    <Card className="mt-6 space-y-3 p-5">
      <p className="font-medium">Tell the society</p>
      <p className="text-sm text-ink-2">Your report is recorded with what your phone saw. Other residents see how many reported, not who.</p>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to add (optional)" />
      <Button tone="danger" busy={busy} onClick={async () => {
        setBusy(true)
        const { error } = await supabase.rpc('api_report_mismatch', {
          p_society: s.id, p_anchor_hash: check.anchorHead?.hash ?? '', p_anchor_seq: check.anchorHead?.highest_sequence ?? 0,
          p_served_hash: check.head.hash, p_note: note,
        })
        setBusy(false)
        toast(error ? error.message : 'Reported.', error ? 'error' : 'ok')
      }}>Report mismatch</Button>
    </Card>
  )
}

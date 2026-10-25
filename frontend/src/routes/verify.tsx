import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, Check, CircleDashed, Globe, Link2, Loader2, PenLine, Smartphone, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSociety } from '../lib/api'
import { useMeStrict } from '../lib/session'
import { anchorUrl, lastCheck, runCheck, verdict, type Check as CheckT, type Step } from '../lib/verify'
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
            <p className="mt-1 text-sm text-ink-2">{plural(check!.entries, 'entry', 'entries')} checked {instant(check!.at)}</p>
          </div>
        </Card>
      )}
      {error && <Card className="mb-6 p-5 text-sm text-break">{error}</Card>}

      <Caption>Steps</Caption>
      <Card className="divide-y divide-line">
        <Row icon={<Link2 className="size-4" />} title="Every entry links to the one before"
          live={live?.fingerprints ?? live?.download} running={!!live && !live.signatures}
          result={check && !live ? (check.chain === 'ok'
            ? { ok: true, text: `${plural(check.entries, 'fingerprint')} recomputed. No gaps, no broken links.` }
            : { ok: false, text: check.chain.failed }) : null} />
        <Row icon={<PenLine className="size-4" />} title="Every approval is signed by its approver"
          live={live?.signatures} running={!!live?.signatures && !live.device}
          result={check && !live ? (check.signatures.failed.length === 0
            ? { ok: true, text: `${plural(check.signatures.checked, 'signature')} match the keys registered in the record.` }
            : { ok: false, text: `Entries ${check.signatures.failed.slice(0, 5).join(', ')}${check.signatures.failed.length > 5 ? '…' : ''} do not match.` }) : null} />
        <Row icon={<Smartphone className="size-4" />} title="Nothing this phone saw has changed"
          running={!!live?.device && !live.anchor}
          result={check && !live ? (check.device === 'first'
            ? { ok: null, text: 'First check on this phone. Nothing earlier to compare against yet.' }
            : check.device === 'consistent'
              ? { ok: true, text: 'Everything seen on earlier checks is unchanged.' }
              : { ok: false, text: `Entry ${check.device.changed} is different from what this phone saw before.` }) : null} />
        <Row icon={<Globe className="size-4" />} title="Matches the fingerprint published outside the committee"
          running={!!live?.anchor}
          result={check && !live ? (check.anchor === 'matches'
            ? { ok: true, text: `Published ${instant(check.anchorHead!.as_of)} at entry ${check.anchorHead!.highest_sequence}.` }
            : check.anchor === 'unpublished'
              ? { ok: null, text: 'No fingerprint is published outside the committee yet. Until one is, this check cannot show that nothing was left out.' }
              : check.anchor === 'unreachable'
                ? { ok: null, text: 'The published record could not be reached from this phone.' }
                : check.anchor === 'behind'
                  ? { ok: false, text: `More entries were published (${check.anchorHead!.highest_sequence}) than the server sent (${check.head.seq}).` }
                  : { ok: false, text: 'The published fingerprint differs from the record the server sent.' }) : null} />
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
            {anchorUrl(s.id) && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink-2">Published at</span>
                <a className="truncate text-accent" href={anchorUrl(s.id)!} target="_blank" rel="noreferrer">{new URL(anchorUrl(s.id)!).host}</a>
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

function Row({ icon, title, live, running, result }: {
  icon: React.ReactNode
  title: string
  live?: [number, number] | undefined
  running?: boolean
  result: { ok: boolean | null; text: string } | null
}) {
  return (
    <div className="flex items-start gap-3 p-4">
      <span className={cx('grid size-8 shrink-0 place-items-center rounded-full',
        result?.ok === true ? 'bg-anchor-soft text-anchor' : result?.ok === false ? 'bg-break-soft text-break' : 'bg-sunken text-ink-2')}>
        {running ? <Loader2 className="size-4 animate-spin" /> : result?.ok === true ? <Check className="size-4" strokeWidth={2.5} /> : result?.ok === false ? <X className="size-4" strokeWidth={2.5} /> : result ? <CircleDashed className="size-4" /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">{title}</p>
        {running && live && <p className="tnum mt-0.5 text-[13px] text-ink-2">{live[0].toLocaleString('en-IN')}{live[1] > live[0] ? ` of ${live[1].toLocaleString('en-IN')}` : ''}</p>}
        {result && <p className={cx('mt-0.5 text-[13px]', result.ok === false ? 'text-break' : 'text-ink-2')}>{result.text}</p>}
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

import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Fingerprint as FpIcon } from 'lucide-react'
import { lastCheck, runCheck, verdict, type Check } from '../lib/verify'
import { instant } from '../lib/format'
import { Facts, cx } from './ui'

/**
 * Where the balance's trust comes from, attached to the figure. Two dates,
 * never a one-word status: when this phone last checked, and whether a
 * fingerprint has been published outside the committee. An absent check
 * reads as absent, never as a pass.
 */
export function Provenance({ society, auto = true }: { society: string; auto?: boolean }) {
  const [check, setCheck] = useState<Check | null>(() => lastCheck(society))
  const [running, setRunning] = useState(false)

  useEffect(() => {
    // A day-old check is re-run quietly in the background.
    if (!auto || (check && Date.now() - check.at < 86_400_000)) return
    let live = true
    setRunning(true)
    runCheck(society).then((c) => live && setCheck(c)).catch(() => {}).finally(() => live && setRunning(false))
    return () => { live = false }
  }, [society, auto]) // eslint-disable-line react-hooks/exhaustive-deps

  const v = check ? verdict(check) : null
  const dot = !v ? 'bg-line-strong' : v.tone === 'ok' ? 'bg-anchor' : v.tone === 'warn' ? 'bg-line-strong' : 'bg-break'

  return (
    <Link to="/verify" className={cx('flex items-center gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-sunken/60',
      v?.tone === 'break' && 'bg-break-soft text-break')}>
      <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-sunken">
        <FpIcon className="size-4 text-ink-2" />
        <span className={cx('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-surface', dot, running && 'animate-pulse')} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">
          {running && !check ? 'Checking the record on this phone…' : v ? v.line : 'Not checked on this phone yet'}
        </span>
        <span className="block text-[13px] text-ink-2">
          <Facts items={[
            check ? `Checked here ${instant(check.at)}` : 'First time on this device',
            check?.anchor === 'matches' && check.anchorHead ? `Published ${instant(check.anchorHead.as_of)}`
              : check?.anchor === 'unreachable' ? 'Published record unreachable'
              : 'Not published outside the committee',
          ]} />
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-2" />
    </Link>
  )
}

import { Link } from '@tanstack/react-router'
import { Flag } from 'lucide-react'
import type { LedgerRow } from '../lib/types'
import { categoryLabel, day, rowTitle } from '../lib/format'
import { Amount, Chip, EntryIcon, Facts, cx } from './ui'

/**
 * One posting. A reversed entry stays, struck through and marked, beside
 * the reversal that cancels it: the ledger shows history, not current truth.
 */
export function EntryRow({ r, flagged, flatLabel }: { r: LedgerRow; flagged?: boolean | 'unknown'; flatLabel?: string | undefined }) {
  const reversed = r.reversed_by_seq !== null
  const isReversal = r.reverses_seq !== null
  const nonCash = r.effect === 'charge' || r.effect === 'charge_reversal'
  return (
    <Link
      to="/entry/$seq"
      params={{ seq: String(r.seq) }}
      className="group flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-sunken focus-visible:bg-sunken"
    >
      <EntryIcon category={r.category} effect={r.effect} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cx('truncate font-medium', reversed && 'text-ink-2 line-through decoration-ink-2/60')}>{rowTitle(r)}</p>
          {/*
            * Three states, because an absent flag is a claim. `false` says
            * this entry is not disputed; `'unknown'` says the dispute list
            * did not load, so nobody can say either way - and rendering
            * nothing for the second would state the first. The outline
            * (unfilled, muted) is never mistaken for the solid flag, and the
            * distinction is in the accessible NAME, not in the colour, so it
            * survives for a reader who cannot see either.
            */}
          {flagged === 'unknown'
            ? <Flag className="size-3.5 shrink-0 text-ink-2" aria-label="Disputed status unknown - the dispute list did not load" />
            : flagged
              ? <Flag className="size-3.5 shrink-0 fill-break text-break" aria-label="Disputed" />
              : null}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-ink-2">
          <Facts items={[
            day(r.business_date),
            isReversal ? `Reverses #${r.reverses_seq}` : r.replaces_seq ? `Replaces #${r.replaces_seq}` : flatLabel ?? categoryLabel(r.category),
            nonCash ? 'Billed to flats' : null,
          ]} />
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Amount minor={r.amount_minor} currency={r.currency} signed={!nonCash} tone={nonCash || reversed ? 'muted' : 'auto'} struck={reversed} />
        {reversed && <Chip tone="break">Reversed</Chip>}
        {isReversal && <Chip tone="break">Reversal</Chip>}
      </div>
    </Link>
  )
}

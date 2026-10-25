import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/*
 * SHARED PAGE FURNITURE, carrying the export's own skeleton.
 *
 * Every export page is the same shape, in this order:
 *
 *   1. a breadcrumb line - GROUP / PAGE - with a compliance tag
 *   2. a headline with a subtitle beside it, and a row of status chips
 *      pushed to the right edge
 *   3. an optional dark inset band carrying the one fact the page is about
 *   4. an optional toolbar - search, filter, export
 *   5. a wide main column beside a narrower rail (8 / 4 on a 12-column grid)
 *
 * That structure is kept whole. Only the contents change, and only where
 * the export asserted something this product cannot.
 */

/* ------------------------------------------------------------------ */

export interface StatusChip {
  label: string
  /* The figure or state. Absent when there is nothing to report yet. */
  value?: string
  tone?: 'neutral' | 'good'
  icon?: IconName
}

export function PageHeader({
  group,
  page,
  tag,
  title,
  subtitle,
  chips,
}: {
  group: string
  page: string
  /* The statutory citation the export carries beside the breadcrumb. */
  tag?: string
  title: string
  subtitle?: string
  chips?: readonly StatusChip[]
}) {
  return (
    <div className="mb-space-md flex flex-col justify-between gap-space-sm md:flex-row md:items-center">
      <div className="flex flex-col gap-space-xs">
        <div className="flex flex-wrap items-center gap-space-xs font-label-code-sm text-label-code-sm text-outline">
          <span className="uppercase">{group}</span>
          <span>/</span>
          <span className="font-semibold uppercase text-on-surface">
            {page}
          </span>
          {tag !== undefined && (
            <span className="rounded bg-surface-container-high px-space-xs py-[1px] font-label-code-sm text-[9px] uppercase tracking-wider text-on-surface-variant">
              {tag}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-space-md gap-y-space-xs">
          <h1 className="font-headline-xl text-headline-xl tracking-tight text-on-surface">
            {title}
          </h1>
          {subtitle !== undefined && (
            <span className="font-body-sm text-body-sm text-outline">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {chips !== undefined && chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-space-xs">
          {chips.map((chip) => (
            <StatusChipView key={chip.label} chip={chip} />
          ))}
        </div>
      )}
    </div>
  )
}

/*
 * The export's telemetry chips - HEIGHT, INVARIANCE, PEERS.
 *
 * The SHAPE is kept and so is the position; the contents are not. A chip
 * reading "INVARIANCE: 100% INTACT" beside a figure nobody computed is a
 * claim, and this one would be screenshotted at an AGM. A chip with no
 * value says so in the same space rather than leaving the row empty.
 */
function StatusChipView({ chip }: { chip: StatusChip }) {
  const good = chip.tone === 'good'

  return (
    <div
      className={
        good
          ? 'flex items-center gap-space-xs rounded bg-secondary-container/40 px-space-sm py-space-xs text-on-secondary-container shadow-sm'
          : 'flex items-center gap-space-xs rounded bg-surface-container-lowest px-space-sm py-space-xs shadow-sm'
      }
    >
      {chip.icon !== undefined && (
        <Icon
          name={chip.icon}
          className={good ? 'size-4 shrink-0' : 'size-4 shrink-0 text-outline'}
        />
      )}
      <span
        className={
          good
            ? 'font-label-code-sm text-label-code-sm font-semibold uppercase tracking-wide'
            : 'font-label-code-sm text-label-code-sm uppercase text-on-surface-variant'
        }
      >
        {chip.label}
        {chip.value !== undefined && ':'}
      </span>
      {chip.value !== undefined && (
        <span className="cf-tabular font-label-code-md text-label-code-md font-semibold text-on-surface">
          {chip.value}
        </span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

/*
 * THE DARK INSET BAND - the export's "Primary Cryptographic Proof Banner".
 *
 * `bg-primary-container` with mono contents, and it is the single loudest
 * element on a page. The export fills it with a 64-character hash, a
 * Polygon transaction link and a "COLLISION RISK: ZERO" badge.
 *
 * None of that is carried. What survives is the band itself and its job:
 * to put the one fact the page turns on where it cannot be missed. When
 * that fact is not loaded, the band says which fact is missing - it never
 * renders a fingerprint that does not exist.
 */
export function ProofBand({
  eyebrow,
  children,
  aside,
}: {
  eyebrow: string
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <div className="mb-space-lg rounded bg-primary-container p-space-md text-on-primary shadow-md">
      <div className="flex flex-col justify-between gap-space-md xl:flex-row xl:items-center">
        <div className="flex max-w-3xl flex-col gap-space-xs">
          <div className="flex items-center gap-space-sm">
            <span className="rounded bg-secondary-fixed px-space-xs py-[2px] font-label-code-sm text-[10px] font-semibold uppercase tracking-wider text-on-secondary-fixed">
              {eyebrow}
            </span>
          </div>
          {children}
        </div>
        {aside !== undefined && (
          <div className="flex shrink-0 flex-row items-center justify-between gap-space-sm xl:flex-col xl:items-end">
            {aside}
          </div>
        )}
      </div>

    </div>
  )
}

/* ------------------------------------------------------------------ */

/*
 * The export's search and filter bar.
 *
 * Every control here is INERT until there is data to filter. An input that
 * accepts typing and does nothing is worse than one that says it is not
 * connected, so each is disabled and labelled rather than decorative.
 */
export function Toolbar({ placeholder }: { placeholder: string }) {
  return (
    <div className="mb-space-lg flex flex-col items-center justify-between gap-space-sm rounded bg-surface-container-lowest p-space-sm shadow-sm md:flex-row">
      <div className="relative flex w-full items-center md:max-w-2xl">
        <span
          aria-hidden="true"
          className="absolute left-space-sm text-outline"
        >
          <Icon name="search" className="size-5" />
        </span>
        <input
          type="text"
          disabled
          placeholder={placeholder}
          aria-describedby="cf-toolbar-state"
          className="w-full rounded bg-surface-container-low py-space-xs pr-space-md pl-10 font-body-md text-body-md text-on-surface placeholder:text-outline disabled:cursor-not-allowed"
        />
      </div>
      <div className="flex w-full items-center justify-end gap-space-xs md:w-auto">
        <span
          id="cf-toolbar-state"
          className="font-label-code-sm text-label-code-sm text-outline"
        >
          Search and export arrive with the ledger data
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

/* The export's 8/4 split on a 12-column grid. */
export function SplitLayout({
  main,
  rail,
}: {
  main: ReactNode
  rail: ReactNode
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
      <div className="flex flex-col gap-space-md xl:col-span-8">{main}</div>
      <aside className="flex flex-col gap-space-md xl:col-span-4">{rail}</aside>
    </div>
  )
}

/*
 * The export's 4-up figure band.
 *
 * `value` is a STRING, already formatted by the caller from server-computed
 * money. This component does no arithmetic and no formatting of its own -
 * a stat tile is exactly where a stray division by 100 would hide.
 */
export interface StatProps {
  label: string
  value: string
  /* One short clause of context. Never a trend claim we cannot substantiate. */
  note?: string
}

export function StatBand({ stats }: { stats: readonly StatProps[] }) {
  return (
    <div className="mb-space-lg grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex flex-col gap-space-xs rounded-xl bg-surface-container-lowest p-space-md shadow-sm"
        >
          <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline">
            {s.label}
          </span>
          {/*
           * `tabular-currency-lg` is 20px, above the figure floor. These are
           * figures a resident acts on.
           */}
          <span className="cf-tabular font-tabular-currency-lg text-tabular-currency-lg font-semibold text-on-surface">
            {s.value}
          </span>
          {s.note !== undefined && (
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {s.note}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export function Panel({
  title,
  eyebrow,
  children,
  footnote,
}: {
  title: string
  /* The export's small-caps label above a panel heading. */
  eyebrow?: string
  children: ReactNode
  footnote?: string
}) {
  return (
    <section className="flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
      <div className="flex flex-col gap-space-xs">
        {eyebrow !== undefined && (
          <span className="font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline">
            {eyebrow}
          </span>
        )}
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
          {title}
        </h2>
      </div>
      {children}
      {footnote !== undefined && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {footnote}
        </p>
      )}
    </section>
  )
}

/*
 * The export's numbered verification steps.
 *
 * Numbered because the content IS a sequence - each step depends on the one
 * before it. Not a decorative 01 / 02 / 03.
 */
export function Steps({
  steps,
}: {
  steps: readonly { title: string; body: string }[]
}) {
  return (
    <ol className="flex flex-col gap-space-md">
      {steps.map((step, i) => (
        <li key={step.title} className="flex gap-space-sm">
          <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded bg-surface-container font-label-code-sm text-label-code-sm font-semibold text-on-surface-variant"
          >
            {i + 1}
          </span>
          <div className="flex flex-col gap-space-xs">
            <span className="font-body-md text-body-md font-semibold text-on-surface">
              {step.title}
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {step.body}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}

/*
 * WHAT THIS SCREEN CANNOT SHOW YET.
 *
 * The backend is a separate lane, so every screen here has real structure
 * and no live data. This states that plainly in the interface rather than
 * filling the space with plausible sample figures.
 *
 * That is not a placeholder convention, it is the product's own rule: a
 * fabricated figure or fingerprint is indistinguishable from a real one and
 * will end up in a screenshot presented at an AGM.
 */
export function AwaitingData({
  what,
  contract,
}: {
  what: string
  contract: string
}) {
  return (
    <div className="flex flex-col gap-space-xs rounded-lg border border-outline-variant bg-surface-container-low/60 p-space-md">
      <p className="font-body-md text-body-md font-medium text-on-surface">
        {what}
      </p>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        {contract}
      </p>
    </div>
  )
}

import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Icon } from './Icon'
import { NavBadge } from './NavBadge'
import { SampleBanner } from './SampleBanner'
import { formatMoney } from '../lib/money'
import {
  SAMPLE_APPROVALS,
  SAMPLE_BALANCE,
  SAMPLE_DATA_ON,
  SAMPLE_SOCIETY,
} from '../lib/sample'

/*
 * THE EXPORT'S SHELL, CARRIED OVER STRUCTURALLY.
 *
 * Every structural class below is the Stitch export's own: the fixed h-20
 * header on `bg-primary-container`, the brand block with its version chip,
 * the centre nav strip, the right-hand figure and role chip, the fixed
 * `w-64` sidebar from `top-20` with its two labelled groups and its footer
 * card, and the `pl-64` content offset.
 *
 * WHAT CHANGED IS CONTENT, NOT STRUCTURE, and only where the export's
 * content made a claim this product cannot make:
 *
 *   - "NODE PEERS 4 / 4 ONLINE" is GONE. There are no peers. Signing keys
 *     are server-held; the integrity claim rests on the chain head being
 *     published OUTSIDE admin control, not on a validator set. A peer count
 *     would advertise a stronger trust model than the one that exists.
 *   - The hard-coded hashes ("0x7e2f...91a4", "BLKHASH: 9bc4...091e") are
 *     gone. A fabricated fingerprint is indistinguishable from a real one
 *     and will end up in a screenshot presented at an AGM.
 *   - "₹24,18,450.50" is gone. The slot stays; the figure arrives from the
 *     server or the slot says it has not.
 *   - The Google-hosted logo <img> is gone; the mark is local inline SVG.
 *   - Material Symbols from a CDN is gone; `Icon` draws inline SVG.
 *
 * Everything else - the shapes, the groups, the order, the density - is the
 * export's.
 */

export interface AppShellProps {
  children: ReactNode
}

interface NavItem {
  to: string
  label: string
  icon: Parameters<typeof Icon>[0]['name']
  /* Count of entries waiting on this admin. Absent when nothing waits. */
  pending?: number
}

/*
 * The export's sidebar: two groups, its headings, its order, its labels.
 *
 * The labels ARE the export's own - "General Ledger", "Approval Desk",
 * "Maintenance Matrix", "Statutory Audit & AGM" - because they are the
 * vocabulary a Maharashtra society committee already uses, and a resident
 * reading a statutory register expects the statutory words.
 *
 * Two are not kept. "Quorum & Multisig" and "Append Block Explorer" each
 * name a trust model this product does not have - there are no peers and no
 * device-held keys - and each is addressed to someone who already knows what
 * a multisig is. They become what the page actually answers.
 */
const GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Statutory Register',
    items: [
      { to: '/', label: 'General Ledger', icon: 'ledger' },
      {
        to: '/approvals',
        label: 'Approval Desk',
        icon: 'approvals',
        /*
         * Spread rather than `pending: cond ? n : undefined`: under
         * `exactOptionalPropertyTypes` an absent property and one set to
         * undefined are different types, and `NavItem` asks for absent.
         */
        ...(SAMPLE_DATA_ON ? { pending: SAMPLE_APPROVALS.length } : {}),
      },
      { to: '/maintenance', label: 'Maintenance Matrix', icon: 'matrix' },
    ],
  },
  {
    heading: 'Fiduciary Governance',
    items: [
      { to: '/audit', label: 'Statutory Audit & AGM', icon: 'audit' },
      { to: '/committee', label: 'Committee & Approvals', icon: 'committee' },
      { to: '/chain', label: 'Record Check', icon: 'chain' },
    ],
  },
]

/* The export's centre nav strip: its four tabs, in its order. */
const TABS: NavItem[] = [
  { to: '/', label: 'Resident Ledger', icon: 'ledger' },
  { to: '/approvals', label: 'Approval Desk', icon: 'approvals' },
  { to: '/maintenance', label: 'Maintenance Matrix', icon: 'matrix' },
  { to: '/audit', label: 'Auditor & AGM', icon: 'audit' },
]

export function AppShell({ children }: AppShellProps) {
  return (
    <>
      {/*
        A keyboard user lands here first. Without it, reaching the ledger
        means tabbing through the whole sidebar on every page.
      */}
      <a
        href="#cf-main"
        className="cf-sr-only focus:not-sr-only focus:fixed focus:top-space-sm focus:left-space-sm focus:z-[60] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-surface-container-lowest focus:px-space-md focus:text-body-md focus:text-on-surface focus:outline focus:outline-2 focus:outline-on-primary-fixed-variant"
      >
        Skip to the ledger
      </a>

      {/* ---- the export's fixed header ---- */}
      <header className="fixed top-0 right-0 left-0 z-50 bg-primary-container text-on-primary shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="flex h-20 w-full items-center justify-between gap-space-sm px-space-md">
          {/* brand block */}
          <div className="flex min-w-0 shrink-0 items-center gap-space-sm">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center text-secondary-fixed"
            >
              <Icon name="shield" className="size-7" />
            </span>
            <div className="flex flex-col">
              <div className="flex items-center gap-space-xs">
                <span className="font-headline-md text-headline-md tracking-tight text-on-primary">
                  ClearFunds
                </span>
                {/*
                 * The export reads "v3.4-ledger". Kept as a build label,
                 * which is what it is - never a claim about the data.
                 */}
                <span className="rounded bg-surface-container-highest px-space-xs py-[2px] font-label-code-sm text-[10px] uppercase text-on-surface">
                  Ledger
                </span>
              </div>
              <span className="max-w-[200px] truncate font-body-sm text-body-sm text-on-primary-container">
                {SAMPLE_DATA_ON ? SAMPLE_SOCIETY : 'Your society'}
              </span>
            </div>
          </div>

          {/* the export's centre nav strip */}
          <nav
            aria-label="Sections"
            className="hidden shrink-0 items-center gap-space-xs rounded bg-on-primary/5 p-space-xs xl:flex"
          >
            {TABS.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                activeOptions={{ exact: tab.to === '/' }}
                className="flex items-center gap-space-xs rounded px-space-sm py-space-xs font-body-sm text-body-sm text-on-primary transition-colors hover:bg-surface-container-high hover:text-on-surface"
                activeProps={{
                  className:
                    'flex items-center gap-space-xs rounded px-space-sm py-space-xs font-body-sm text-body-sm bg-surface-container text-on-surface font-bold',
                }}
              >
                <span>{tab.label}</span>
                {tab.pending !== undefined && (
                  <NavBadge count={tab.pending} label={tab.label} />
                )}
              </Link>
            ))}
          </nav>

          {/* the export's right-hand figure, role chip and controls */}
          <div className="flex shrink-0 items-center gap-space-sm">
            <VaultNet />
          </div>
        </div>
      </header>

      {/* ---- the export's fixed sidebar ---- */}
      <aside
        aria-label="All sections"
        className="fixed top-20 bottom-0 left-0 z-40 hidden w-64 flex-col justify-between overflow-y-auto bg-surface-container-lowest py-space-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] xl:flex"
      >
        <div className="flex flex-col gap-space-lg px-space-md">
          {GROUPS.map((group) => (
            <div key={group.heading} className="flex flex-col">
              <span className="mb-space-xs px-space-sm font-label-code-sm text-label-code-sm uppercase tracking-wider text-outline">
                {group.heading}
              </span>
              <nav className="flex flex-col gap-space-xs">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.to === '/' }}
                    /*
                     * `min-h-11` is 44px. NOT a performance setting and not
                     * a style choice - it is the size of a finger. It did
                     * not move when the network assumption changed and it
                     * does not move now.
                     */
                    className="flex min-h-11 items-center gap-space-sm rounded px-space-sm font-body-md text-body-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                    activeProps={{
                      className:
                        'flex min-h-11 items-center gap-space-sm rounded px-space-sm font-body-md text-body-md bg-surface-container text-on-surface font-semibold',
                    }}
                  >
                    <Icon name={item.icon} className="size-[18px] shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.pending !== undefined && (
                      <span className="ml-auto">
                        <NavBadge count={item.pending} label={item.label} />
                      </span>
                    )}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>

        {/*
          The export's footer card held "NODE PEERS 4 / 4 ONLINE" and a
          fabricated block hash. Same card, same position; the contents are
          the only claim that is both true and useful here.
        */}
        <div className="border-t border-surface-container-high px-space-md pt-space-md">
          <div className="flex flex-col gap-space-xs rounded bg-surface-container-low p-space-sm">
            <span className="font-label-code-sm text-label-code-sm uppercase text-outline">
              How this record is kept
            </span>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Every entry is approved by more than one admin and chained to
              the one before it, so the record cannot be changed quietly.
            </p>
          </div>
        </div>
      </aside>

      {/* ---- the export's content offset ---- */}
      <div className="xl:pl-64">
        <main
          id="cf-main"
          className="min-h-screen w-full bg-surface p-gutter pt-24 pb-space-xl xl:p-space-lg xl:pt-24"
        >
          <SampleBanner />
          {children}
        </main>
      </div>
    </>
  )
}

/*
 * The export shows "VAULT NET ₹24,18,450.50" in the header.
 *
 * The label and the slot are kept because a treasurer checking the society
 * balance at a glance is exactly what that corner is for. The FIGURE is not
 * kept: this frontend computes no money and invents none, so until the
 * server sends a balance the slot says what it does not know.
 */
function VaultNet() {
  const balance = SAMPLE_DATA_ON ? formatMoney(SAMPLE_BALANCE) : null

  return (
    <div className="hidden flex-col items-end pr-space-xs md:flex">
      <span className="font-label-code-sm text-label-code-sm uppercase text-on-primary-container">
        Society balance
      </span>
      {/*
        `formatMoney` returns null on an amount it cannot read, and that
        case must SAY so rather than render an empty slot - a blank space
        where a balance belongs reads as zero.
      */}
      {balance !== null ? (
        /*
         * `cf-tabular` so the figure does not reflow as it changes, and
         * `text-on-primary` rather than the dimmer container colour -
         * this is the one number in the header a treasurer reads.
         */
        <span className="cf-tabular font-body-md text-body-md font-semibold text-on-primary">
          {balance}
        </span>
      ) : (
        <span className="font-body-sm text-body-sm text-on-primary-container">
          Not loaded
        </span>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { LogOut, Moon, MoreHorizontal, Sun } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useMeStrict, hats } from '../lib/session'
import { navFor, splitTabs, type NavId, type NavItem } from '../lib/nav'
import { useDisputes, useLive, useProposals, useSignoffs, useYears } from '../lib/api'
import { monthOf, roleLabel, todayIST } from '../lib/format'
import { recentMonths, waitsOn } from '../lib/pending'

/*
 * Re-exported, and the routes import them from HERE rather than from lib/.
 *
 * The rules themselves live in lib/pending.ts, where they are tested without
 * mounting a router. This is the import edge, and it is load-bearing: three
 * lazy route chunks sharing this module is why rolldown gives the router its
 * own `link-*` chunk. Pointing those routes straight at lib/pending.ts
 * removed the shared edge, the heuristic stopped firing, and the router's
 * 20 KB folded into the ENTRY chunk - the resident read path, which the
 * bundle budget keeps lightest. Total bytes were identical, so nothing but
 * `expect: ['ui', 'link']` in scripts/budget.mjs noticed.
 *
 * Declaring the split with advancedChunks instead was tried and is worse:
 * naming one group replaces rolldown's whole strategy, so the 78.8 KB
 * Supabase chunk folded into the entry as well.
 */
export { recentMonths, waitsOn }
import { Avatar, IconButton, Sheet, cx } from './ui'
import { Logo } from './Logo'
import type { Me } from '../lib/types'

export function useBadges(me: Me): Partial<Record<NavId, number>> {
  const committee = !!me.seat
  const proposals = useProposals()
  const signoffs = useSignoffs()
  const years = useYears()
  const disputes = useDisputes()
  return useMemo(() => {
    const b: Partial<Record<NavId, number>> = {}
    if (committee) b.approvals = (proposals.data ?? []).filter((p) => waitsOn(p, me)).length
    if (me.seat?.role === 'president' && signoffs.data) {
      const done = new Set(signoffs.data.map((s) => s.body.month))
      const cur = monthOf(todayIST())
      b.signoff = recentMonths(cur, 3).filter((m) => m < cur && !done.has(m)).length
    }
    if (me.auditor_for.length && years.data) {
      b.yearend = years.data.filter((y) => me.auditor_for.includes(y.fy) && y.ended && !y.closed).length
    }
    if (committee && disputes.data) b.disputes = disputes.data.filter((d) => d.is_open).length
    return b
  }, [committee, me, proposals.data, signoffs.data, years.data, disputes.data])
}

export function ThemeSwitch() {
  const [dark, setDark] = useState(() =>
    document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches)
  return (
    <IconButton
      label={dark ? 'Use light theme' : 'Use dark theme'}
      onClick={() => {
        const next = dark ? 'light' : 'dark'
        document.documentElement.dataset.theme = next
        try { localStorage.setItem('cf-theme', next) } catch { /* private mode: theme lasts this visit */ }
        setDark(!dark)
      }}
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </IconButton>
  )
}

function Badge({ n, tone = 'attention' }: { n?: number | undefined; tone?: 'attention' }) {
  if (!n) return null
  return (
    <span className={cx('tnum grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold', tone === 'attention' && 'bg-attention text-surface')}>
      {n > 40 ? '40+' : n}
      <span className="sr-only"> waiting</span>
    </span>
  )
}

function isActive(path: string, to: string) {
  return to === '/' ? path === '/' : path === to || path.startsWith(to + '/')
}

export function Shell({ children }: { children: ReactNode }) {
  const me = useMeStrict()
  useLive(me.society.id)
  const items = navFor(me)
  const badges = useBadges(me)
  const { tabs, more } = splitTabs(items, badges)
  const path = useRouterState({ select: (s) => s.location.pathname })
  const [moreOpen, setMoreOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  useEffect(() => setMoreOpen(false), [path])

  const who = me.seat ? roleLabel[me.seat.role] : me.auditor_for.length ? 'Auditor' : me.tenure?.kind === 'tenant' ? `Tenant, ${me.tenure.flat}` : me.tenure ? `Flat ${me.tenure.flat}` : ''

  return (
    <div className="min-h-dvh lg:pl-64 print:!pl-0">
      {/* Desktop rail: same items, never collapses. */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 print:!hidden flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-20 items-center gap-2.5 px-5">
          <Logo className="size-12" />
          <div className="min-w-0">
            <p className="text-[15px] leading-tight font-semibold">ClearFunds</p>
            <p className="truncate text-xs text-ink-2">{me.society.name}</p>
          </div>
        </div>
        <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {items.map((it) => <RailLink key={it.id} item={it} active={isActive(path, it.to)} badge={badges[it.id]} />)}
        </nav>
        <div className="flex items-center gap-3 border-t border-line p-3">
          <Avatar name={me.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{me.name}</p>
            <p className="truncate text-xs text-ink-2">{who}</p>
          </div>
          <ThemeSwitch />
          <IconButton label="Sign out" onClick={() => supabase.auth.signOut()}><LogOut className="size-[18px]" /></IconButton>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex h-16 print:hidden items-center justify-between gap-2 border-b border-line/70 bg-bg/85 px-4 backdrop-blur-md lg:hidden">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <Logo className="size-11" />
          <span className="truncate text-[15px] font-semibold">{me.society.name}</span>
        </Link>
        <div className="flex items-center">
          <ThemeSwitch />
          <button className="cursor-pointer rounded-full p-1" aria-label="Account" onClick={() => setMenu(true)}>
            <Avatar name={me.name} size="sm" tone="accent" />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pt-5 pb-28 sm:px-6 lg:pt-8 lg:pb-12">{children}</main>

      {/* Mobile tab bar: five at most, no hamburger. */}
      <nav aria-label="Main" className="pb-safe print:hidden fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden">
        <ul className="mx-auto flex max-w-lg">
          {tabs.map((it) => (
            <li key={it.id} className="flex-1"><TabLink item={it} active={isActive(path, it.to)} badge={badges[it.id]} /></li>
          ))}
          {more.length > 0 && (
            <li className="flex-1">
              <button onClick={() => setMoreOpen(true)} className={cx('flex h-16 w-full cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-medium',
                more.some((m) => isActive(path, m.to)) ? 'text-accent' : 'text-ink-2')}>
                <MoreHorizontal className="size-[22px]" strokeWidth={1.8} />More
              </button>
            </li>
          )}
        </ul>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid grid-cols-3 gap-2">
          {more.map((it) => (
            // Preloads when the sheet opens, not when the Shell mounts: these
            // are exactly the routes that did NOT make the five tabs, so they
            // are the cold ones, and the tap that opens the sheet buys the
            // chunk time to arrive before the tap that picks a route.
            <Link key={it.id} to={it.to} preload={NAV_PRELOAD} className="flex flex-col items-center gap-2 rounded-2xl bg-sunken px-2 py-4 text-sm font-medium">
              <it.icon className="size-6 text-ink-2" strokeWidth={1.8} />{it.label}
            </Link>
          ))}
        </div>
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} title={me.name}>
        <p className="text-sm text-ink-2">{[who, me.email].filter(Boolean).join(' · ')}</p>
        <p className="mt-1 text-sm text-ink-2">{[...hats(me)].length > 1 ? 'You hold more than one role here.' : ''}</p>
        <button onClick={() => supabase.auth.signOut()} className="mt-4 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-line font-medium">
          <LogOut className="size-4" /> Sign out
        </button>
      </Sheet>
    </div>
  )
}

/*
 * preload="viewport" on every nav link, overriding the router's global
 * 'intent'.
 *
 * 'intent' preloads on hover or focus. A PHONE HAS NEITHER - a tap is not a
 * hover - so on the device the bundle budget is written for, mid-range Android
 * on working 4G, nav links were preloading nothing at all and every navigation
 * started from cold. The desktop rail got the win and the phone did not.
 *
 * 'viewport' uses IntersectionObserver, which fires on touch. Both navs are
 * permanently on screen, so this resolves to "preload the nav's routes once
 * the shell mounts" - at most ten chunks on the rail, five on the tab bar,
 * each 1.3-11.5 KB gzipped, against a 76.2 KB entry. The ledger's is the
 * largest and is also the one most likely to be tapped.
 *
 * This preloads the route's CODE. The DATA is separately warm because the
 * dashboard already fetched nine of the twelve reads and every other resident
 * screen is a subset of them; main.tsx's staleTime is what keeps those cached
 * long enough for the navigation to land on them.
 */
const NAV_PRELOAD = 'viewport' as const

function RailLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number | undefined }) {
  return (
    <Link to={item.to} preload={NAV_PRELOAD} aria-current={active ? 'page' : undefined}
      className={cx('flex h-10 items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium transition-colors',
        active ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-sunken hover:text-ink')}>
      <item.icon className="size-[18px]" strokeWidth={1.9} />
      <span className="flex-1">{item.label}</span>
      <Badge n={badge} />
    </Link>
  )
}

function TabLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number | undefined }) {
  return (
    <Link to={item.to} preload={NAV_PRELOAD} aria-current={active ? 'page' : undefined}
      className={cx('relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-accent' : 'text-ink-2')}>
      <span className="relative">
        <item.icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
        {badge ? <span className="absolute -top-1.5 -right-2.5"><Badge n={badge} /></span> : null}
      </span>
      {item.label}
    </Link>
  )
}

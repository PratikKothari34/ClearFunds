import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDownLeft, ArrowUpRight, Briefcase, Car, Check, Copy, Droplets, FileSearch, Home, Loader2,
  MoveVertical, PartyPopper, Sprout, SprayCan, UserCheck, Wrench, X, Zap, Circle, Undo2, Receipt,
} from 'lucide-react'
import { parts } from '../lib/money'
import { countable } from '../lib/countable'
import { initials } from '../lib/format'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ---------------------------------------------------------------- buttons

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
  size?: 'sm' | 'md' | 'lg'
  busy?: boolean
  icon?: ReactNode
}

export function Button({ tone = 'secondary', size = 'md', busy, icon, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-[background,box-shadow,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
        size === 'sm' && 'h-9 px-3 text-sm',
        size === 'md' && 'h-11 px-4 text-[15px]',
        size === 'lg' && 'h-13 px-5 text-base',
        tone === 'primary' && 'bg-accent text-accent-ink shadow-card hover:brightness-110',
        tone === 'secondary' && 'border border-line bg-surface text-ink hover:bg-sunken',
        tone === 'ghost' && 'text-ink hover:bg-sunken',
        tone === 'quiet' && 'text-accent hover:bg-accent-soft',
        tone === 'danger' && 'border border-break/30 bg-break-soft text-break hover:brightness-95',
        className,
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx('grid size-11 cursor-pointer place-items-center rounded-xl text-ink-2 transition-colors hover:bg-sunken hover:text-ink', className)}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------- money

type AmountProps = {
  /* Nullable because the wire is: Amount discloses what it cannot read
   * rather than making every call site guard first. */
  minor: number | null
  currency?: string
  signed?: boolean
  size?: 'sm' | 'md' | 'lg' | 'hero'
  tone?: 'auto' | 'ink' | 'muted'
  struck?: boolean
  className?: string
}

/** The most important pixels on every screen. Sign and colour together, never colour alone. */
export function Amount({ minor, currency = 'INR', signed, size = 'md', tone = 'ink', struck, className }: AmountProps) {
  /*
   * An amount that cannot be read is disclosed, never thrown. parts() raises
   * RangeError on anything that is not a safe integer, and there is no error
   * boundary, so one bad row used to blank the whole screen - a worse outcome
   * than the row itself being wrong. Says "not available" rather than a
   * figure, so nobody reads it as zero.
   */
  const c = countable(minor)
  if (!c.readable) {
    return (
      <span className={cx('text-ink-2', size === 'sm' && 'text-sm', size === 'md' && 'text-base', className)}
        title="This figure could not be read from the record.">
        not available
      </span>
    )
  }
  const p = parts(c.minor, currency, { signed: signed ?? false })
  const color = tone === 'muted' ? 'text-ink-2' : tone === 'auto' ? (c.minor < 0 ? 'text-debit' : c.minor > 0 ? 'text-credit' : 'text-ink') : 'text-ink'
  const Tag = struck ? 's' : 'span'
  return (
    <Tag
      className={cx(
        'tnum whitespace-nowrap',
        size === 'sm' && 'text-sm',
        size === 'md' && 'text-base font-medium',
        size === 'lg' && 'text-2xl font-semibold tracking-tight',
        size === 'hero' && 'text-[2.75rem] leading-none font-semibold tracking-[-0.03em] sm:text-6xl',
        color,
        struck && 'decoration-[1.5px] opacity-70',
        className,
      )}
    >
      {p.sign === '-' ? '−' : p.sign}
      <span className={cx(size === 'hero' && 'mr-0.5 align-[0.35em] text-[0.45em] font-medium text-ink-2')}>{p.symbol}</span>
      {p.whole}
      {p.fraction && <span className={cx(size === 'hero' ? 'text-[0.45em] font-medium text-ink-2' : 'opacity-80')}>.{p.fraction}</span>}
    </Tag>
  )
}

// ---------------------------------------------------------------- chips, meters

type Tone = 'neutral' | 'credit' | 'debit' | 'attention' | 'anchor' | 'break' | 'accent'
const toneClass: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2',
  credit: 'bg-credit-soft text-credit',
  debit: 'bg-debit-soft text-debit',
  attention: 'bg-attention-soft text-attention',
  anchor: 'bg-anchor-soft text-anchor',
  break: 'bg-break-soft text-break',
  accent: 'bg-accent-soft text-accent',
}

export function Chip({ tone = 'neutral', children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium', toneClass[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

/** How far an approval has come: one segment per approval needed. */
export function Meter({ have, need, declined = 0, label }: { have: number; need: number; declined?: number; label?: string }) {
  const segs = Math.min(need, 13)
  const scaled = need > 13 ? Math.round((have / need) * 13) : have
  return (
    <div className="flex items-center gap-3" role="img" aria-label={label ?? `${have} of ${need} approvals`}>
      <div className="flex flex-1 gap-1">
        {Array.from({ length: segs }, (_, i) => (
          <span key={i} className={cx('h-1.5 flex-1 rounded-full', i < scaled ? 'bg-accent' : 'bg-line')} />
        ))}
      </div>
      <span className="tnum shrink-0 text-xs font-medium text-ink-2">
        {have}/{need}
        {declined > 0 && <span className="text-break"> · {declined} no</span>}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- layout

export function Card({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={cx('card', className)}>{children}</As>
}

export function Caption({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-2 flex min-h-8 items-center justify-between gap-3 px-1', className)}>
      <h2 className="text-[13px] font-medium text-ink-2">{children}</h2>
      {action}
    </div>
  )
}

export function PageTitle({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.65rem] font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-ink-2">{sub}</p>}
      </div>
      {action}
    </header>
  )
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-sunken text-ink-2">{icon}</div>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-[34ch] text-sm text-ink-2">{children}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-sunken', className)} aria-hidden />
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-16" />)}
    </div>
  )
}

export function Failed({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Card className="p-5">
      <p className="font-medium text-break">Could not load this.</p>
      <p className="mt-1 text-sm text-ink-2">{error instanceof Error ? error.message : 'The server did not answer.'}</p>
      {retry && <Button size="sm" className="mt-3" onClick={retry}>Try again</Button>}
    </Card>
  )
}

export function Avatar({ name, size = 'md', tone = 'neutral' }: { name: string; size?: 'sm' | 'md'; tone?: 'neutral' | 'accent' }) {
  return (
    <span
      aria-hidden
      className={cx(
        'grid shrink-0 place-items-center rounded-full font-semibold',
        size === 'sm' ? 'size-7 text-[11px]' : 'size-10 text-sm',
        tone === 'accent' ? 'bg-accent text-accent-ink' : 'bg-sunken text-ink-2',
      )}
    >
      {initials(name)}
    </span>
  )
}

/** Two facts on one line, separated by a rule that still reads as a boundary to a screen reader. */
export function Facts({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-x-2 gap-y-0.5', className)}>
      {items.filter(Boolean).map((it, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {i > 0 && (
            <>
              <span aria-hidden className="h-3 w-px bg-line-strong/60" />
              <span className="sr-only">, </span>
            </>
          )}
          {it}
        </span>
      ))}
    </span>
  )
}

// ---------------------------------------------------------------- category icon

const catIcon: Record<string, typeof Home> = {
  maintenance: Home, security: UserCheck, housekeeping: SprayCan, electricity: Zap, water: Droplets,
  lift: MoveVertical, repairs: Wrench, gardening: Sprout, audit: FileSearch, admin: Briefcase,
  parking: Car, events: PartyPopper,
}

export function EntryIcon({ category, effect }: { category: string | null; effect: string }) {
  const I = effect === 'reversal' || effect === 'charge_reversal' ? Undo2
    : effect === 'charge' ? Receipt
    : catIcon[category ?? ''] ?? Circle
  const tone = effect === 'receipt' ? 'bg-credit-soft text-credit'
    : effect === 'expense' ? 'bg-debit-soft text-debit'
    : effect.endsWith('reversal') ? 'bg-break-soft text-break'
    : 'bg-sunken text-ink-2'
  return (
    <span aria-hidden className={cx('relative grid size-10 shrink-0 place-items-center rounded-xl', tone)}>
      <I className="size-[18px]" strokeWidth={1.8} />
      {(effect === 'receipt' || effect === 'expense') && (
        <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-surface">
          {effect === 'receipt'
            ? <ArrowDownLeft className="size-3 text-credit" strokeWidth={2.5} />
            : <ArrowUpRight className="size-3 text-debit" strokeWidth={2.5} />}
        </span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------- fingerprint

/** "Fingerprint", never "hash", in anything a resident reads. */
export function Fingerprint({ value, short = true, className }: { value: string; short?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false)
  const shown = short ? value.slice(0, 16) : value
  const groups = shown.match(/.{1,4}/g) ?? []
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch { /* clipboard denied: nothing to do */ }
      }}
      className={cx('group inline-flex max-w-full cursor-pointer items-center gap-2 rounded-lg bg-sunken px-2 py-1 text-left font-mono text-[12.5px] text-ink-2 hover:text-ink', className)}
      aria-label={`Fingerprint ${value}. Copy`}
    >
      <span className={cx('flex flex-wrap gap-x-1.5', !short && 'break-all')}>
        {groups.map((g, i) => <span key={i}>{g}</span>)}
        {short && <span aria-hidden>…</span>}
      </span>
      {copied ? <Check className="size-3.5 shrink-0 text-credit" /> : <Copy className="size-3.5 shrink-0 opacity-50 group-hover:opacity-100" />}
    </button>
  )
}

// ---------------------------------------------------------------- forms

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>
      {children}
      {error ? <p className="text-sm text-break" role="alert">{error}</p> : hint ? <p className="text-[13px] text-ink-2">{hint}</p> : null}
    </div>
  )
}

const inputBase = 'w-full rounded-xl border border-line bg-surface px-3.5 text-ink placeholder:text-ink-2/70 outline-none transition-[border,box-shadow] focus:border-accent focus:ring-4 focus:ring-accent/15'

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(inputBase, 'h-12 text-base', className)} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(inputBase, 'min-h-24 py-3 text-base leading-relaxed', className)} />
}

/** An amount field that only ever yields integer minor units. */
export function MoneyInput({ id, value, onChange, autoFocus }: { id?: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-2xl font-medium text-ink-2">₹</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        placeholder="0"
        className={cx(inputBase, 'tnum h-16 pl-10 text-3xl font-semibold tracking-tight')}
      />
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options, label, className }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; count?: number }[]
  label: string
  className?: string
}) {
  return (
    <div role="tablist" aria-label={label} className={cx('flex gap-1 overflow-x-auto rounded-xl bg-sunken p-1 [scrollbar-width:none]', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && <span className="tnum text-xs text-ink-2">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- sheet

export function Sheet({ open, onClose, title, children, footer, wide }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const scroll = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button,a[href],input,textarea,select,[tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const first = f[0]!
        const last = f[f.length - 1]!
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = scroll
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="fade-in absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className={cx(
          'sheet-in relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-lift outline-none sm:rounded-3xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2 sm:pt-5">
          <h2 id={id} className="text-lg font-semibold tracking-tight">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2"><X className="size-5" /></IconButton>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-5 pt-3 pb-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------- toast

type ToastT = { id: number; text: string; tone: 'ok' | 'error' }
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'error') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([])
  const push = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, text, tone }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('rise pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lift',
            t.tone === 'ok' ? 'bg-ink text-bg' : 'bg-break text-white')}>
            {t.tone === 'ok' && <Check className="mt-0.5 size-4 shrink-0" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

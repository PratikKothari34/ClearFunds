import { useState, type FormEvent } from 'react'
import { ArrowRight, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button, Field, Input, cx } from './ui'
import { Logo } from './Logo'
import { ThemeSwitch } from './Shell'

// Local demo accounts (backend/scripts/seed.ts). Offered only by the dev
// server and only when VITE_DEMO_LOGINS is set: a production build never
// carries them.
const DEMO = import.meta.env.DEV && import.meta.env.VITE_DEMO_LOGINS
  ? [
      ['resident', 'Resident', 'Ravi, A-604'],
      ['tenant', 'Tenant', 'Sana, B-904'],
      ['treasurer', 'Treasurer', 'Rohan Mehta'],
      ['secretary', 'Secretary', 'Farah Shaikh'],
      ['president', 'President', 'Anjali Deshpande'],
      ['m1', 'Committee', 'Vikram Joshi'],
      ['auditor', 'Auditor', 'CA Meera Kulkarni'],
    ] as const
  : []

export function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // shouldCreateUser stays true so a resident the committee added can sign
    // in the first time; an email with no account here sees nothing.
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: location.origin } })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError('That code did not work. Check the latest email, or send a new one.')
  }

  async function demo(key: string) {
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: `${key}@gulmohar.test`, password: 'clearfunds-demo' })
    setBusy(false)
    if (error) setError(`${error.message}. Run backend/scripts/seed.ts first.`)
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-bg lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2.5">
          {/* No inversion classes: the mark is a raster and carries its own
              plate, so it reads on this dark panel as-is. */}
          <Logo className="size-13" />
          <span className="text-lg font-semibold">ClearFunds</span>
        </div>
        <ChainArt />
        <div>
          <p className="max-w-md text-[2.4rem] leading-[1.1] font-semibold tracking-tight">Society money, in the open.</p>
          <p className="mt-3 max-w-sm text-bg/65">No one moves it alone. Every change leaves a trace.</p>
        </div>
      </aside>

      <main className="relative flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="absolute top-4 right-4"><ThemeSwitch /></div>
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo className="size-13" />
            <span className="text-lg font-semibold">ClearFunds</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{sent ? 'Check your email' : 'Sign in'}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {sent ? <>We sent a 6-digit code to <span className="font-medium text-ink">{email}</span>.</> : 'With the email your committee registered.'}
          </p>

          {!sent ? (
            <form onSubmit={send} className="mt-6 space-y-4">
              <Field label="Email" htmlFor="email" error={error}>
                <Input id="email" type="email" required autoComplete="email" inputMode="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </Field>
              <Button tone="primary" size="lg" className="w-full" busy={busy} icon={<Mail className="size-4" />}>Send code</Button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-6 space-y-4">
              <Field label="Code" htmlFor="code" error={error}>
                <Input id="code" required autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="tnum text-center text-2xl font-semibold tracking-[0.5em]" placeholder="······" />
              </Field>
              <Button tone="primary" size="lg" className="w-full" busy={busy} disabled={code.length < 6} icon={<ArrowRight className="size-4" />}>Continue</Button>
              <button type="button" className="w-full cursor-pointer text-sm text-ink-2 hover:text-ink" onClick={() => { setSent(false); setCode('') }}>
                Use a different email
              </button>
              {import.meta.env.DEV && (
                <a href="http://127.0.0.1:54324" target="_blank" rel="noreferrer" className="block text-center text-xs text-accent">Local mailbox</a>
              )}
            </form>
          )}

          {DEMO.length > 0 && (
            <div className="mt-10">
              <p className="mb-2 text-xs font-medium text-ink-2">Demo society, local only</p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO.map(([key, role, name]) => (
                  <button key={key} disabled={busy} onClick={() => demo(key)}
                    className={cx('cursor-pointer rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft disabled:opacity-50')}>
                    <span className="block text-sm font-medium">{role}</span>
                    <span className="block truncate text-xs text-ink-2">{name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

/** Three entries, each carrying the fingerprint of the one above it. */
function ChainArt() {
  const rows = [
    ['Security, Oct', '−₹68,400.00', '9f3a 21c0'],
    ['Flat A-604, UPI', '+₹3,250.00', '4be1 7d92'],
    ['Lift AMC', '−₹9,800.00', 'c07e 5a18'],
  ]
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden>
      {rows.map(([t, a, f], i) => (
        <div key={i} className="relative">
          <div className="rise flex items-center justify-between rounded-2xl border border-bg/10 bg-bg/[0.06] px-5 py-4" style={{ animationDelay: `${i * 120}ms` }}>
            <div>
              <p className="text-[15px] font-medium">{t}</p>
              <p className="mt-1 font-mono text-[11px] text-bg/50">{f} …</p>
            </div>
            <p className="tnum text-[15px] font-semibold">{a}</p>
          </div>
          {i < rows.length - 1 && (
            <div className="flex h-7 items-center pl-8">
              <span className="h-full w-px bg-gradient-to-b from-accent to-accent/20" />
              <span className="ml-3 font-mono text-[10px] text-bg/40">links to {f}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

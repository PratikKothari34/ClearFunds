import { useState, type FormEvent } from 'react'
import { ArrowRight, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { checkCode, checkEmail } from '../lib/credentials'
import { Button, Field, Input, cx } from './ui'
import { Logo } from './Logo'
import { ThemeSwitch } from './Shell'

// Local demo accounts (backend/scripts/seed.ts). Offered only by the dev
// server and only when VITE_DEMO_LOGINS is set: a production build never
// carries them.
const DEMO_ON = import.meta.env.DEV && import.meta.env.VITE_DEMO_LOGINS

/*
 * The seed account's credentials live behind the SAME gate as the list, so
 * the strings are eliminated from a production build rather than merely
 * unreachable.
 *
 * They used to sit inline in `demo()`, which was ungated - no button ever
 * rendered in production, but the domain and password still survived
 * minification and shipped in the entry chunk to every resident's phone.
 * Not a leaked secret (`.test` resolves nowhere, the accounts exist only in
 * a local seed, and this repo is public) but a credential-shaped string in
 * a production bundle, and dead code there besides.
 *
 * Null in production, so `demo()` returns before it can be called. Verify
 * with: grep -r clearfunds-demo frontend/dist  ->  no match.
 */
const DEMO_AUTH = DEMO_ON
  ? (key: string) => ({ email: `${key}@gulmohar.test`, password: 'clearfunds-demo' })
  : null

const DEMO = DEMO_ON
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
    /*
     * Checked HERE, not left to `type="email" required`. Constraint validation
     * does not run on a programmatic submit and varies between engines, so the
     * attribute holds on most paths and not all - which for the authentication
     * boundary is the same as not holding. The decision itself is in lib/.
     *
     * It is a SHAPE check and nothing more. Whether the address belongs to a
     * registered resident is deliberately NOT asked before sign-in: an
     * endpoint that answered it would tell any stranger which emails live in
     * this society. An unregistered address gets a code, signs in, and is
     * refused by the server afterwards, when there is someone to refuse.
     */
    const checked = checkEmail(email)
    if (!checked.ok) {
      setError(checked.reason)
      return
    }
    setBusy(true)
    setError(null)
    /*
     * NO emailRedirectTo, deliberately: the option aims a link at the project's
     * Site URL, and this screen asks for a six-digit code instead.
     *
     * It does NOT select the template, though an earlier version of this
     * comment said so. Supabase picks that by whether the ADDRESS is
     * confirmed - an unconfirmed one gets *Confirm signup* while *Confirm
     * email* is on - so the link-and-no-code mail is fixed by the templates
     * and the hosted Auth settings, not from here. Omitting this is still
     * right; it is just not the fix.
     *
     * The failure is invisible from here: the send SUCCEEDS, this screen
     * advances to "Check your email", and only the mail itself is wrong -
     * which is why a test that stops at `sent === true` would stay green.
     *
     * shouldCreateUser stays true so a resident the committee added can sign
     * in the first time; an email with no account here sees nothing.
     */
    const { error: sendError } = await supabase.auth.signInWithOtp({ email: checked.value })
    setBusy(false)
    if (sendError) setError(sendError.message)
    else setSent(true)
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    /*
     * A wrong-length or non-numeric code cannot verify, and sending it anyway
     * SPENDS AN ATTEMPT: the provider rate-limits verification, so a few
     * stray submissions can lock out the person who is typing carefully.
     * `maxLength` and `inputMode="numeric"` are hints - `inputMode` restricts
     * nothing at all - so the check belongs here.
     *
     * The address is re-checked rather than assumed: `sent` only records that
     * a send succeeded, and the field stays editable behind this step.
     */
    const checkedEmail = checkEmail(email)
    if (!checkedEmail.ok) {
      setError(checkedEmail.reason)
      return
    }
    const checkedCode = checkCode(code)
    if (!checkedCode.ok) {
      setError(checkedCode.reason)
      return
    }
    setBusy(true)
    setError(null)
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: checkedEmail.value, token: checkedCode.value, type: 'email' })
    setBusy(false)
    if (verifyError) setError('That code did not work. Check the latest email, or send a new one.')
  }

  /*
   * Gated on the SAME condition as DEMO, not just on DEMO being empty.
   *
   * The array was already dev-only, so no button ever rendered in
   * production - but this function was unconditional, so the seed
   * account's domain and its password survived minification and shipped
   * in the entry chunk to every resident's phone. Not a leaked secret:
   * `.test` resolves nowhere, the accounts exist only in a local seed, and
   * the repo is public. It is a credential-shaped string in a production
   * bundle and dead code besides, which is reason enough for it not to be
   * there. Behind this gate the literals are eliminated, not merely
   * unreachable - verified by grepping dist for the password.
   */
  async function demo(key: string) {
    if (!DEMO_AUTH) return
    setBusy(true)
    const { error: demoError } = await supabase.auth.signInWithPassword(DEMO_AUTH(key))
    setBusy(false)
    if (demoError) setError(`${demoError.message}. Run backend/scripts/seed.ts first.`)
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

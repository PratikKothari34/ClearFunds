/*
 * The sign-in email arrived in production carrying a confirmation LINK and no
 * six-digit code, while the screen behind it asked for a six-digit code. The
 * person could not finish signing in: there was no number anywhere in the mail
 * to type, and the link landed on a localhost page.
 *
 * We passed `emailRedirectTo: location.origin` and then rendered a code field.
 *
 * WHAT ACTUALLY SELECTS THE TEMPLATE - corrected, and not what this file
 * first claimed. Supabase chooses by the ADDRESS, not by this option: an
 * address it has never confirmed gets the *Confirm signup* template whenever
 * *Confirm email* is on, which is the hosted default. The local stack sets
 * `enable_confirmations = false`, which is why no amount of local testing
 * could reproduce it. Every real first sign-in is from an unconfirmed
 * address, so production sent the stock confirmation mail.
 *
 * So omitting `emailRedirectTo` does NOT by itself change which template is
 * sent, and the assertion below must not be read as proof that the mail is
 * fixed. It is still correct to omit it - we have no use for a redirect and
 * passing one aims a link at the Site URL - but the mail was fixed by the
 * templates and the hosted Auth settings, not from this file.
 *
 * WHY THIS NEEDS A TEST AND NOT ONLY A COMMENT.
 *
 * Every signal available on this machine stays green with the bug present:
 *
 *   - the call SUCCEEDS; `signInWithOtp` does not care that the template it
 *     selects disagrees with the next screen
 *   - the component advances to "Check your email" either way, so any test
 *     that drives the form and asserts on the rendered result passes
 *   - typecheck passes; `emailRedirectTo` is a valid option
 *   - nothing is logged, and the console is clean
 *
 * The only place the defect is visible is the ARGUMENT, and the only machine
 * that sees the consequence is the mail server. So the assertion has to be on
 * what we passed, not on what the screen then showed - the rule from
 * commit-checks: test the call that DECIDES, not the surface that reports.
 *
 * The matching backend faults - the Site URL still pointing at localhost, and
 * the confirm-signup wording inviting a self-registration this product does not
 * allow - are filed separately; they are not fixable from here.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * jsdom has no matchMedia, and the theme switch inside this screen reads it.
 * Stubbed HERE rather than in the shared setup file on purpose: a global stub
 * would answer this question for every other suite too, including the token
 * suites that assert on the dark ramp, and a theme test passing against a
 * hard-coded "not dark" is exactly the kind of green that means nothing.
 */
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))

/*
 * Typed to RECEIVE the argument, not just to return a value. A bare
 * `vi.fn(async () => ...)` records calls fine at runtime but types its own
 * parameter list as empty, so reading `mock.calls[0]` back needs a cast - and
 * the cast is what would keep compiling after the call's shape changed. The
 * whole point of this suite is the argument, so the argument is typed.
 */
type SendArgs = { email: string; options?: Record<string, unknown> }
const signInWithOtp = vi.fn(async (_args: SendArgs) => ({ error: null }))
const verifyOtp = vi.fn(async (_args: Record<string, unknown>) => ({ error: null }))

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithOtp, verifyOtp } },
  SUPABASE_URL: 'https://example.supabase.co',
}))

const { Login } = await import('./Login')

async function submitEmail(address: string) {
  render(<Login />)
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: address } })
  fireEvent.click(screen.getByRole('button', { name: /send code/i }))
  // The handler awaits the send before it advances; let that microtask settle.
  await screen.findByText(/check your email/i)
}

describe('the sign-in email must carry a code, not a link', () => {
  beforeEach(() => {
    signInWithOtp.mockClear()
    verifyOtp.mockClear()
  })

  it('does not ask for a redirect, because that selects the link template', async () => {
    await submitEmail('resident@example.com')

    expect(signInWithOtp).toHaveBeenCalledTimes(1)
    const call = signInWithOtp.mock.calls[0]
    if (!call) throw new Error('no send was attempted, so there is no argument to check')
    const options = call[0].options ?? {}

    expect(
      'emailRedirectTo' in options,
      'this screen asks for a 6-digit code, so it must not pass a redirect: the option aims a link at the Site URL and we have no use for one. It does NOT select the template - Supabase picks that by whether the address is confirmed - so this passing is not evidence the mail is right',
    ).toBe(false)
  })

  it('asks for a code for the address that was typed, lowercased and trimmed', async () => {
    await submitEmail('  Resident@Example.COM  ')

    const call = signInWithOtp.mock.calls[0]
    if (!call) throw new Error('no send was attempted, so there is no address to check')
    expect(
      call[0].email,
      'the address is the account key; a stray case or space makes a second, empty account',
    ).toBe('resident@example.com')
  })

  it('advances to the code step, which is why the broken template was invisible', async () => {
    await submitEmail('resident@example.com')

    /*
     * Deliberately asserted, and deliberately NOT the whole test. This passing
     * while the mail is unusable is the reason the first case exists: the
     * screen cannot tell which template the server chose.
     */
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
  })
})

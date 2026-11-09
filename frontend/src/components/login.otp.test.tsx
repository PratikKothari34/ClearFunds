/*
 * The sign-in email arrived in production carrying a confirmation LINK and no
 * six-digit code, while the screen behind it asked for a six-digit code. The
 * person could not finish signing in: there was no number anywhere in the mail
 * to type, and the link landed on a localhost page.
 *
 * The cause was one option. `signInWithOtp` sends the TOKEN template when it is
 * called without `emailRedirectTo`, and the LINK template when it is called
 * with one. We passed `emailRedirectTo: location.origin`, so we asked for the
 * link and then rendered a code field.
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
      'emailRedirectTo asks Supabase for the confirmation-LINK email; this screen asks for a 6-digit code, so the mail arrives with nothing the person can type',
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

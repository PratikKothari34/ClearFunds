import { describe, expect, it } from 'vitest'
import { environmentFault } from './environment'

/**
 * These assert the DECISION - is this build usable, and which variables does a
 * reader have to set - not the sentence it is reported in. The sentence will
 * be reworded; the classification is the guard.
 *
 * The bug being guarded is a blank page, so the property that matters is that
 * an incomplete environment is *detectable before anything is attempted*. A
 * test that mounted a component and asserted on the screen would speak only
 * for that screen, and the failure took down every screen at once.
 */
describe('environmentFault', () => {
  it('reports no fault when both variables are set', () => {
    expect(environmentFault(true, true)).toBeNull()
  })

  it('reports a fault whenever either variable is unset', () => {
    /*
     * The half-configured cases are the ones that actually happen: a deploy
     * sets one variable, or renames one. Treating "some configuration exists"
     * as configured is how a blank page gets shipped twice.
     */
    for (const [url, key] of [
      [false, false],
      [true, false],
      [false, true],
    ] as const) {
      expect(environmentFault(url, key), `url=${url} key=${key}`).not.toBeNull()
    }
  })

  it('names exactly the variables that are unset, and no others', () => {
    expect(environmentFault(false, true)?.missing).toEqual(['VITE_SUPABASE_URL'])
    expect(environmentFault(true, false)?.missing).toEqual(['VITE_SUPABASE_PUBLISHABLE_KEY'])
    expect(environmentFault(false, false)?.missing).toEqual([
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
    ])
  })

  it('names the one unset variable rather than both when half the environment exists', () => {
    // A reader told "Supabase is not configured" re-checks the variable that
    // is already set and concludes the message is wrong.
    const fault = environmentFault(true, false)
    expect(fault?.summary).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
    expect(fault?.summary).not.toContain('VITE_SUPABASE_URL ')
  })

  it('says a rebuild is required, because setting the variable alone fixes nothing', () => {
    // This is the whole content of the fix for whoever reads the screen: they
    // are build-time variables. Without this sentence the obvious action -
    // set it in the dashboard - leaves the page just as blank.
    expect(environmentFault(false, false)?.summary.toLowerCase()).toContain('rebuil')
  })

  it('never puts a variable value in the message, only its name', () => {
    /*
     * The summary reaches a screen, and a screen reaches a screenshot in a
     * WhatsApp group. Names are safe to show; values are not, and a
     * publishable key is still a credential-shaped string nobody needs to see.
     */
    const summary = environmentFault(false, false)?.summary ?? ''
    expect(summary).not.toMatch(/sb_publishable|sb_secret|https?:\/\/\S+supabase/)
  })

  it('gives a non-empty sentence for every faulting combination', () => {
    for (const [url, key] of [
      [false, false],
      [true, false],
      [false, true],
    ] as const) {
      expect(environmentFault(url, key)?.summary.trim().length, `url=${url} key=${key}`).toBeGreaterThan(0)
    }
  })
})

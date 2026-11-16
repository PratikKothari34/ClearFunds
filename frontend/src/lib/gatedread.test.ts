/**
 * A READ THAT CANNOT START IS NOT A READ STILL ARRIVING.
 *
 * `/reports` drew its loading skeleton forever. `useReport(fy)` carries
 * `enabled: !!fy` and `fy` comes from `useYears()`, so when the years read
 * FAILED the report query stayed disabled - and a disabled TanStack query
 * reports `isPending: true, isError: false` indefinitely. The route gated on
 * the inner query alone, so it promised data that was never coming while the
 * failure sat on the other query, unread.
 *
 * Found against the running app: the backend does not serve `appointment_seq`
 * yet, the parse boundary correctly refused the row, and the screen showed
 * that refusal as "still loading".
 *
 * Tests the function that DECIDES, not the screen. A render test speaks only
 * for the screen it mounts, and this decision lived in the route - which is
 * why it was never covered.
 */
import { describe, expect, it } from 'vitest'
import { gatedRead } from './listread'

/** A TanStack query's two flags, in the four states one can really be in. */
const settled = { isPending: false, isError: false }
const loading = { isPending: true, isError: false }
const failed = { isPending: false, isError: true }
/* THE STATE THAT CAUSED THE BUG. A query with `enabled: false` is pending
 * and not failing - not because data is coming, but because it never ran. */
const disabled = { isPending: true, isError: false }

describe('gatedRead', () => {
  it('THE DEFECT: a failed gate is failed, not pending, though the inner read is disabled', () => {
    // The years read failed, so `fy` was never set and the report query
    // never started. Reading the inner query alone yields "pending" and a
    // spinner that cannot resolve. The failure must win.
    expect(gatedRead(failed, disabled)).toBe('failed')
  })

  it('reads the failure BEFORE the data, on either side', () => {
    // TanStack keeps the last successful data across a failed refetch, so
    // `isError` arrives with rows in hand. Ready would present a stale
    // answer as a current one.
    expect(gatedRead(failed, settled)).toBe('failed')
    expect(gatedRead(settled, failed)).toBe('failed')
    expect(gatedRead(failed, failed)).toBe('failed')
  })

  it('is failed when a failure coincides with a load in flight', () => {
    expect(gatedRead(failed, loading)).toBe('failed')
    expect(gatedRead(loading, failed)).toBe('failed')
  })

  it('is pending while either read is genuinely in flight', () => {
    expect(gatedRead(loading, loading)).toBe('pending')
    expect(gatedRead(loading, settled)).toBe('pending')
    expect(gatedRead(settled, loading)).toBe('pending')
  })

  it('is pending when the gate succeeded but the inner read has not started', () => {
    /*
     * Honest, and transient by construction: the effect that sets the key
     * runs on the gate's data, so the inner query is about to be enabled.
     * It must NOT be 'ready' - there is no report to render yet.
     */
    expect(gatedRead(settled, disabled)).toBe('pending')
  })

  it('is ready ONLY when both reads have actually landed', () => {
    expect(gatedRead(settled, settled)).toBe('ready')
  })

  it('never reports ready while anything is pending or failed', () => {
    // The rule, not a sample: readiness requires both settled and neither
    // failed. Asserted over every combination rather than a chosen few.
    const states = [settled, loading, failed, disabled]
    for (const g of states) {
      for (const i of states) {
        const r = gatedRead(g, i)
        if (r === 'ready') {
          expect(g.isPending || g.isError || i.isPending || i.isError).toBe(false)
        }
        if (g.isError || i.isError) expect(r).toBe('failed')
      }
    }
  })
})

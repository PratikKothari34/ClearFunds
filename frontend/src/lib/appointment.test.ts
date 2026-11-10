/**
 * An opinion's authorisation is the appointment entry, matched by SEQ.
 *
 * The defect: `/reports` and `/year-end` both identified the auditor by name
 * - a bare `h.auditor` string, and a "Auditor: <names>" line taken from the
 * year's current appointment list. The contract carries `appointment_seq` on
 * each `year_close` precisely so two appointments of the same person stay
 * distinct, and says never to match by name. Matched by name, a statement
 * published under a revoked appointment is indistinguishable from one
 * published under a live one.
 *
 * Tests the function that DECIDES. The rendering is pinned separately; a
 * render test speaks only for the screen it mounts, and the computation is
 * the guard.
 */
import { describe, expect, it } from 'vitest'
import { authorisation, nameIsAmbiguous } from './appointment'
import { year } from './rows'
import { parse } from './parse'
import type { Year } from './types'

const SAME_NAME = 'CA Meera Kulkarni'

const entry = (e: Partial<Year['history'][number]>): Year['history'][number] => ({
  seq: 400, opinion: 'qualified', statement: 'In our opinion...',
  auditor: SAME_NAME, appointment_seq: 9, recorded_at: 1_700_000_000,
  ...e,
})

describe('authorisation', () => {
  it('matches the appointment by seq, not by name', () => {
    // THE DEFECT: two appointments of the same person. Only the seq
    // distinguishes which one authorised this statement.
    const first = entry({ appointment_seq: 9 })
    const second = entry({ appointment_seq: 31 })
    const appointments = [
      { name: SAME_NAME, appointment_seq: 31 },
    ]
    // The live appointment authorises the statement that cites it...
    expect(authorisation(second, appointments)).toEqual({
      state: 'authorised', seq: 31, name: SAME_NAME,
    })
    // ...and does NOT authorise the one citing the revoked appointment,
    // though the names are identical.
    expect(authorisation(first, appointments).state).toBe('unauthorised')
  })

  it('does not accept a name match when no seq matches', () => {
    const e = entry({ appointment_seq: 9 })
    // Same person, different appointment. A name match must not rescue it.
    const result = authorisation(e, [{ name: SAME_NAME, appointment_seq: 77 }])
    expect(result.state).not.toBe('authorised')
  })

  it('returns the APPOINTMENT name when it disagrees with the entry', () => {
    // The appointment is the record. An entry naming someone else does not
    // get to relabel who the society authorised.
    const e = entry({ auditor: 'Someone Else', appointment_seq: 9 })
    const result = authorisation(e, [{ name: SAME_NAME, appointment_seq: 9 }])
    expect(result).toEqual({ state: 'authorised', seq: 9, name: SAME_NAME })
  })

  it('does NOT claim a statement is unauthorised when appointments were not reported', () => {
    // null is the server declining to say. The coalesce that turns a missing
    // answer into a negative one is the bug being guarded here: it would
    // accuse an honest statement of lacking authorisation.
    expect(authorisation(entry({}), null).state).toBe('unconfirmable')
  })

  it('distinguishes "not reported" from "reported, and absent"', () => {
    const e = entry({ appointment_seq: 9 })
    expect(authorisation(e, null).state).toBe('unconfirmable')
    expect(authorisation(e, []).state).toBe('unauthorised')
  })

  it('discloses an appointment the year does not contain', () => {
    // Either the server invented an appointment or it cannot produce the
    // authorisation for an opinion it published. Both are the tamper-evidence
    // claim failing, so neither may render as an ordinary signed opinion.
    const result = authorisation(entry({ appointment_seq: 12345 }), [
      { name: SAME_NAME, appointment_seq: 9 },
    ])
    expect(result).toEqual({ state: 'unauthorised', seq: 12345 })
  })

  it('treats an EMPTY reported list as unauthorised, not unconfirmable', () => {
    /*
     * `[]` is the society answering "nobody is appointed for this year", and
     * a statement published anyway is exactly what must be disclosed. It
     * reaches this function as `[]` and not as null - `?.auditor ?? null` on
     * a year whose list is empty yields `[]`, which is the behaviour the two
     * screens depend on. A refactor to `|| null` would break it silently,
     * because an empty array is truthy and an empty one is not falsy.
     */
    expect(authorisation(entry({ appointment_seq: 9 }), []).state).toBe('unauthorised')
  })

  it('carries the seq in every outcome, so a surface can always cite it', () => {
    const e = entry({ appointment_seq: 42 })
    for (const appts of [null, [], [{ name: SAME_NAME, appointment_seq: 42 }]]) {
      expect(authorisation(e, appts).seq).toBe(42)
    }
  })
})

/**
 * The field has to be REQUIRED at the parse boundary, not merely typed.
 *
 * `object()` keeps unknown fields rather than stripping them, so an
 * undeclared `appointment_seq` still arrives at runtime - untyped and
 * unchecked. That is the worse failure: a backend that stopped sending it
 * would parse clean, every statement would miss its appointment, and
 * `authorisation()` would report every one of them `unauthorised` - an
 * accusation manufactured from a field nobody sent. Refusing the row is the
 * only outcome that cannot be mistaken for evidence.
 */
describe('the parse boundary requires appointment_seq', () => {
  const yearRow = (history: unknown[]) => ({
    fy: '2025-26', starts: '2025-04-01', ends: '2026-03-31', ended: true, closed: true,
    headline: 'qualified', headline_seq: 400, history, auditor: null,
  })
  const opinionRow = (over: Record<string, unknown> = {}) => ({
    seq: 400, opinion: 'qualified', statement: 's', auditor: SAME_NAME,
    appointment_seq: 9, recorded_at: 0, ...over,
  })

  /* A parser is a function that returns the parsed value or THROWS; there is
   * no ok flag to read. Asserting a throw is the assertion. */
  const run = (history: unknown[]) => () => parse(year, yearRow(history), 'years')

  it('accepts a history entry that carries it', () => {
    expect(run([opinionRow()])).not.toThrow()
    // And the value survives parsing, rather than merely being tolerated.
    expect(parse(year, yearRow([opinionRow()]), 'years').history[0]!.appointment_seq).toBe(9)
  })

  it('REFUSES a history entry with the field missing', () => {
    const { appointment_seq: _omitted, ...without } = opinionRow()
    expect(run([without])).toThrow()
  })

  it('REFUSES a null appointment_seq - the contract says never null', () => {
    expect(run([opinionRow({ appointment_seq: null })])).toThrow()
  })

  it('REFUSES a non-integer appointment_seq', () => {
    // A seq is a chain position. A string that looks like one is not one.
    expect(run([opinionRow({ appointment_seq: '9' })])).toThrow()
  })

  it('names the field in the failure, so the cause is readable in a log', () => {
    // A message naming only "years" sends someone reading a production error
    // hunting through the whole response for a field that is simply absent.
    expect(run([opinionRow({ appointment_seq: null })])).toThrow(/appointment_seq/)
  })
})

describe('nameIsAmbiguous', () => {
  it('is true when one name covers two different appointments', () => {
    // THE CASE THE CONTRACT EXISTS FOR. The name alone cannot identify the
    // authorisation, so the screen must show the appointment entry.
    expect(nameIsAmbiguous([
      entry({ seq: 400, appointment_seq: 9 }),
      entry({ seq: 500, appointment_seq: 31 }),
    ])).toBe(true)
  })

  it('is false when the same appointment gave several opinions', () => {
    // One authorisation, revisited. Nothing ambiguous about the name.
    expect(nameIsAmbiguous([
      entry({ seq: 400, appointment_seq: 9 }),
      entry({ seq: 500, appointment_seq: 9 }),
    ])).toBe(false)
  })

  it('is false for different people under different appointments', () => {
    expect(nameIsAmbiguous([
      entry({ seq: 400, auditor: 'CA A', appointment_seq: 9 }),
      entry({ seq: 500, auditor: 'CA B', appointment_seq: 31 }),
    ])).toBe(false)
  })

  it('is false for an empty history', () => {
    expect(nameIsAmbiguous([])).toBe(false)
  })

  it('finds a shared name across NON-ADJACENT entries', () => {
    // A pairwise or neighbour-only comparison passes the two-entry cases and
    // misses this one, which is the shape a real multi-year history has.
    expect(nameIsAmbiguous([
      entry({ seq: 400, auditor: SAME_NAME, appointment_seq: 9 }),
      entry({ seq: 500, auditor: 'CA Other', appointment_seq: 20 }),
      entry({ seq: 600, auditor: SAME_NAME, appointment_seq: 31 }),
    ])).toBe(true)
  })

  it('is false for a single entry, whatever it carries', () => {
    // One opinion cannot be ambiguous with anything.
    expect(nameIsAmbiguous([entry({})])).toBe(false)
  })
})

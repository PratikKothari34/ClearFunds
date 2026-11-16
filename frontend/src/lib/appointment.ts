/*
 * WHICH APPOINTMENT AUTHORISED THIS STATEMENT.
 *
 * An opinion is only worth reading if the society actually authorised the
 * person who gave it. The authorisation is a chained entry: the `posting` of
 * the `appoint_auditor` proposal that appointed them, carried on the
 * `year_close` itself as `appointment_seq`, and never null.
 *
 * The defect this closes is that nothing on either screen used it:
 *
 * - `/reports` printed `h.auditor` - a bare name - above the statement.
 * - `/year-end` printed "Auditor: <names>" from `y.auditor`, the year's
 *   CURRENT appointment list, directly above a history whose entries each
 *   name their own auditor.
 *
 * Both compare by NAME, which the contract says explicitly not to do, because
 * two appointments of the same person must stay distinct. A society that
 * appointed CA Meera Kulkarni, revoked the appointment, and appointed her
 * again for the same year has two authorisations; a statement published under
 * the first is not authorised by the second. Matched by name they are one
 * person and the screen cannot tell them apart - so an opinion given under a
 * revoked appointment reads exactly like one given under a live appointment.
 *
 * `appointment_seq` is also how an UNAUTHORISED statement becomes visible. If
 * an opinion's appointment is not among the year's appointments at all, that
 * is not a display quirk: either the server is reporting an appointment the
 * society never made, or it is reporting an opinion whose authorisation it
 * cannot produce. Both are exactly the "cannot be changed quietly" claim
 * failing, so the surface DISCLOSES it rather than falling back to the name.
 *
 * Three outcomes, never two, on the same rule as `auditors.ts`: `null` on
 * `Year.auditor` is the server declining to report appointments, which is NOT
 * evidence that the appointment is missing. That is `unconfirmable`, and it
 * is a different sentence from `unauthorised`.
 */
import type { Year } from './types'

type Entry = Year['history'][number]

export type Authorisation =
  /**
   * The appointment that authorised this statement, found by seq among the
   * year's appointments. `name` is the appointment's own name, not the
   * entry's: when they disagree, the appointment is the record.
   */
  | { state: 'authorised'; seq: number; name: string }
  /**
   * The year's appointments were reported and this statement's appointment is
   * NOT among them. The society cannot show what authorised it.
   */
  | { state: 'unauthorised'; seq: number }
  /**
   * The year reported no appointment list (`auditor: null`), so the
   * authorisation can neither be confirmed nor denied.
   */
  | { state: 'unconfirmable'; seq: number }

/**
 * Match one opinion to the appointment that authorised it.
 *
 * By seq only. A name that happens to match proves nothing, and a name that
 * does not match is not grounds for rejecting a seq that does - the
 * appointment is the record, so the appointment's name is what is returned.
 */
export function authorisation(entry: Entry, appointments: Year['auditor']): Authorisation {
  const seq = entry.appointment_seq
  /*
   * Null is the server declining to say, not an empty list. Checked BEFORE
   * the lookup, because `(appointments ?? []).find(...)` returns undefined
   * for both "declined to report" and "reported, and it is absent" - the
   * coalesce that turns a missing answer into a negative one.
   */
  if (appointments === null) return { state: 'unconfirmable', seq }
  const found = appointments.find((a) => a.appointment_seq === seq)
  return found ? { state: 'authorised', seq, name: found.name } : { state: 'unauthorised', seq }
}

/**
 * Does this year's history contain two DIFFERENT appointments that carry the
 * same name?
 *
 * When it does, the name alone is ambiguous on screen and the appointment
 * entry must be shown beside it. This is the case the contract's "never
 * matched by name" exists for, and it is why the seq is rendered rather than
 * held only in the data.
 */
export function nameIsAmbiguous(history: readonly Entry[]): boolean {
  const byName = new Map<string, Set<number>>()
  for (const h of history) {
    const seqs = byName.get(h.auditor) ?? new Set<number>()
    seqs.add(h.appointment_seq)
    byName.set(h.auditor, seqs)
  }
  return [...byName.values()].some((seqs) => seqs.size > 1)
}

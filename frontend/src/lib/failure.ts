/*
 * What kind of failure a read produced, decided once, so the `Failed` card
 * only renders the answer.
 *
 * Four kinds, because they are four different facts about the record:
 *
 * - `unreachable` - the request or its answer never arrived. Retrying may work.
 * - `refused`     - the server answered in words written for the reader, so
 *                   those words are quoted.
 * - `shape`       - the server DID answer, but not in the shape the contract
 *                   declares, and the parser refused it rather than guess.
 *                   This used to fall through to "The server did not answer",
 *                   which is false: it answered, with a 200, and the screen
 *                   declined to show a figure it could not vouch for. Saying
 *                   the server was silent sends the reader to check their
 *                   connection, which cannot help.
 * - `unknown`     - anything else, including a bug of ours. Summarised, never
 *                   quoted: an internal message is not written for a resident.
 *
 * Imports only dependency-free modules. `components/ui.tsx` reads this and
 * every route imports `ui.tsx`, so pulling the SDK in here would put it in the
 * entry path - see `reachable.ts`.
 */
import { ShapeError } from './parse'
import { Refused, unreachable } from './reachable'

export type FailureKind = 'unreachable' | 'refused' | 'shape' | 'unknown'

/*
 * Order matters only where a value could match twice, and none can today: the
 * three classes are unrelated and `unreachable()` accepts only `Unreachable`
 * and `TypeError`. The connection is still tested first, because if a later
 * change ever made a transport failure also look like one of the others, the
 * reader's useful action - try again - is the one to keep.
 */
export function failureKind(error: unknown): FailureKind {
  if (unreachable(error)) return 'unreachable'
  if (error instanceof Refused) return 'refused'
  if (error instanceof ShapeError) return 'shape'
  return 'unknown'
}

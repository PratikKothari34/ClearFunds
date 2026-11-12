/*
 * What one flat's tile on /dues says, decided here so the route only draws it.
 *
 * Three states, because a green check is a claim that the flat has settled:
 * a figure that could not be read must not get one, or it reads as "paid" to
 * every resident and treasurer who sees it.
 *
 * The accessible name carries the exact figure. It used to say only "A-102,
 * owes", and because `aria-label` replaces the button's content, the amount
 * printed on the tile never reached a screen reader - a treasurer listening
 * to the grid heard which flats owe and not one figure, and had to open every
 * sheet to learn what a sighted reader sees at a glance. The tile prints whole
 * units to fit; the name has room for the exact amount, so it says that.
 *
 * The currency is the society's, passed in. The tile hardcoded `'INR'`, which
 * the money rule forbids: the format follows the data, never a literal.
 */
import { countable } from './countable'
import { format, parts } from './money'

export type DuesTile =
  | { state: 'unknown'; label: string }
  | { state: 'owes'; label: string; figure: string }
  | { state: 'settled'; label: string }

export function duesTile(flat: string, outstanding: unknown, currency: string): DuesTile {
  const c = countable(outstanding)
  if (!c.readable) return { state: 'unknown', label: `${flat}, amount could not be read` }
  if (!c.owing) return { state: 'settled', label: `${flat}, settled` }
  return {
    state: 'owes',
    label: `${flat}, owes ${format(c.minor, currency)}`,
    figure: parts(c.minor, currency).whole,
  }
}

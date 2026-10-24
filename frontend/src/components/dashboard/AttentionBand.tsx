import { Link } from '@tanstack/react-router'
import { Band } from '../Band'
import { Amount } from '../Amount'
import { BandFallback } from '../BandFallback'
import type { AttentionItem } from '../../lib/types'

/**
 * Band 2. The one band whose content varies and whose slot never does.
 *
 * This band carries a repaired defect, and the repair is the design.
 * Letting the band render nothing when there is nothing pending moves
 * every tap target below it up by roughly 96px, so the balance, the
 * fingerprint and the recent rows all sit somewhere different depending
 * on whether the viewer happens to have work waiting. A volunteer
 * cannot learn a layout that moves, and the feature becomes
 * undiscoverable because most visits never show it.
 *
 * So: the slot is reserved, the content varies.
 *
 * Amber means THIS VIEWER MUST ACT. A resident with no flag and no dues
 * sees none for months, and that is what makes it mean something when
 * it appears. The empty state is --ink-quiet, deliberately not amber.
 *
 * The items are assembled server-side per viewer and already
 * role-filtered. This component must never build the list by filtering
 * a fuller payload.
 */

export function AttentionBand({
  items,
  failed = false,
  onRetry,
}: {
  readonly items: readonly AttentionItem[]
  /**
   * The bands fetch independently, so this one can fail while the
   * balance succeeds. It must then render a retry and NOT the empty
   * state: in this design an empty slot means "nothing needs you", and
   * a failed fetch does not mean that. Showing the empty copy here
   * would tell a treasurer with four pending approvals that they are
   * free.
   */
  readonly failed?: boolean
  readonly onRetry?: () => void
}) {
  const count = items.length

  if (failed) {
    return (
      <BandFallback
        heading="Couldn't check what needs you"
        headingId="cf-band-attention"
        explanation="The rest of this page loaded. This part did not, so anything waiting on you is not shown here yet."
        onRetry={onRetry}
      />
    )
  }

  return (
    <Band
      heading={count === 0 ? 'Nothing needs you' : headingFor(count)}
      headingId="cf-band-attention"
    >
      {/*
       * aria-live, so a resident who approves the last pending item
       * hears the band become empty rather than having to go looking
       * for whether it worked. polite, not assertive: this is a status
       * change, not an interruption.
       */}
      <div aria-live="polite">
        {count === 0 ? (
          <p className="text-ink-quiet max-w-[68ch]">
            Nothing needs you right now. Anything waiting on you will appear
            here.
          </p>
        ) : (
          <ul className="flex flex-col gap-(--cf-s2)">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href}
                  // min-h-11: this is the most-tapped control on the
                  // screen for an approver, often one-handed.
                  className="flex items-baseline justify-between gap-(--cf-s2) min-h-11 text-attention underline decoration-1 underline-offset-2"
                >
                  <span className="max-w-[68ch]">{item.label}</span>
                  {item.amount && <Amount value={item.amount} />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Band>
  )
}

/**
 * "2 things need you". Plain language and a real count, because "You
 * have pending items" tells a volunteer nothing about whether to open
 * the app now or after dinner.
 */
function headingFor(count: number): string {
  return count === 1 ? '1 thing needs you' : `${count} things need you`
}

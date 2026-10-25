import type { ReactNode } from 'react'
import { NOT_CONNECTED, NOT_CONNECTED_EXPLANATION } from '../lib/pending'

/**
 * A control that is deliberately inert until the backend exists.
 *
 * `aria-disabled`, NOT `disabled`. A `disabled` button is removed from
 * the tab order and from most screen readers' control lists, so a
 * keyboard or screen reader user cannot find out that the control
 * exists at all - they would read a page about approving an expense
 * with no approve control anywhere, which is a different and worse
 * lie than an unfinished one. `aria-disabled` keeps it focusable and
 * announced, and says it cannot be used.
 *
 * The status is stated TWICE on purpose, in two channels:
 *   - in the accessible name, so it arrives with the button;
 *   - in visible text beneath it, so a sighted resident gets it too.
 *
 * `onClick` is not supplied and no handler is attached: there is
 * nothing to call. The button is not a form submit either, so it
 * cannot navigate or reload by accident.
 */
export function PendingAction({
  children,
  srSuffix,
  className = 'min-h-11 px-space-lg border border-outline-variant rounded-sm bg-surface text-on-surface font-medium',
}: {
  readonly children: ReactNode
  /**
   * What this particular control acts on - the payee and amount, the
   * report's name, the month. Visually hidden, because a queue of nine
   * identical "Approve this expense" buttons is unusable with a screen
   * reader and this is the control that moves money.
   */
  readonly srSuffix?: ReactNode
  readonly className?: string
}) {
  return (
    <>
      <button type="button" aria-disabled="true" className={className}>
        {children}
        {srSuffix !== undefined && <span className="cf-sr-only"> {srSuffix}</span>}
        <span className="cf-sr-only"> &mdash; {NOT_CONNECTED}</span>
      </button>
      <p className="mt-space-md mb-0 font-label-code-sm text-label-code-sm text-on-surface-variant max-w-[68ch]">
        {NOT_CONNECTED_EXPLANATION}
      </p>
    </>
  )
}

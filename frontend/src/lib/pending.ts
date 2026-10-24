/**
 * The one sentence every control that has no backend yet must carry.
 *
 * FOUR CONTROLS IN THIS PRODUCT DO NOTHING WHEN PRESSED - approve an
 * expense, download a report, sign off a month, send a sign-in code -
 * because the server that would act on them is a separate lane and is
 * not built. A button that silently does nothing is the worst of the
 * available states: a treasurer presses Approve, sees no change, and
 * cannot tell whether the approval was recorded, whether the page is
 * broken, or whether their phone dropped the request. On the one
 * control that moves money, that ambiguity is the whole problem the
 * product exists to remove.
 *
 * So the controls stay visible and stay in the tab order - removing
 * them would hide the shape of the product from the committee
 * evaluating it - and each one says, in the same words every time,
 * that it is not connected yet.
 *
 * ONE STRING, NOT FOUR. Written per page it drifts, and four slightly
 * different explanations of the same state read as four different
 * faults.
 */
export const NOT_CONNECTED = 'Not connected yet'

/**
 * The longer form, for the line beneath the control.
 *
 * It says what is missing and what has NOT happened, because the
 * second half is the part a resident or an admin actually needs: the
 * fear on a money screen is never "the button is broken", it is "did
 * I just do something".
 */
export const NOT_CONNECTED_EXPLANATION =
  'This button is not connected to the society’s records yet, so pressing it does nothing and nothing has been recorded.'

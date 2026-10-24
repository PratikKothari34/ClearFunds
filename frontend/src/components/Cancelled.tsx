import type { ReactNode } from 'react'

/**
 * Something cancelled: struck through, and said in words.
 *
 * A STRIKE-THROUGH IS PURELY VISUAL. On its own a screen reader
 * announces the full amount of a cancelled payment with nothing to say
 * it was cancelled, which is the most dangerous thing this product
 * could mis-state — a resident hears a figure that no longer counts.
 *
 * It cannot be left to the explanation beside it either. On the entry
 * detail page that sentence renders only when `reversedBy` is present,
 * so a reversed entry whose reversal had not arrived would be struck
 * through and otherwise silent.
 *
 * This exists as ONE component because the pairing was hand-rolled at
 * three separate call sites — a row's narration, a row's amount, and
 * the detail page's amount — and a fourth would have been written the
 * same way. The `<s>` and the word belong together by construction, so
 * that no call site can add the strike and forget the word.
 */
export function Cancelled({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <s>{children}</s>
      {/*
       * The leading space is deliberate: without it a screen reader
       * runs the amount and the word together.
       */}
      <span className="cf-sr-only"> (cancelled)</span>
    </>
  )
}

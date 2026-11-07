import type { ErrorComponentProps } from '@tanstack/react-router'
import { Card, Button } from './ui'

/*
 * What a route shows when its own render threw.
 *
 * There was no error boundary anywhere in the tree, and the code says so in
 * three separate places - `countable.ts`, `format.ts` and `allocation.ts` each
 * document a value that "blanks the whole screen" rather than one figure. The
 * sharp path is `money.ts`, which raises `RangeError` on a value that is not a
 * safe integer, from `format()`, DURING render. TanStack Query cannot catch
 * that: Query owns the fetch, not the render, so a bad value that parsed
 * cleanly and then failed to format took the entire page down to white.
 *
 * Deliberately NOT the `Failed` card. `Failed` says "Could not load this",
 * which is a claim about the network, and it offers a retry. Both are wrong
 * here: the data arrived, and re-fetching it produces the same crash. Telling
 * a resident to try again for a fault that is not transient is worse than
 * saying nothing, because they will keep trying.
 *
 * It also never says the ledger is wrong. A figure this device could not
 * render is a figure this device could not render - the chain is unaffected,
 * and the entry is still there to be read on another screen or another phone.
 * Saying "something went wrong" over a money surface invites exactly the
 * conclusion the product exists to prevent, so the copy locates the fault in
 * the app and points at the part of the ledger that still works.
 *
 * `reset` re-renders the route without a reload, which recovers the case where
 * the throw came from state this route built rather than from the data. When
 * it was the data, the same error returns - and that is honest, because the
 * alternative is a screen that looks fixed while showing nothing.
 */
export function Crashed({ error, reset }: ErrorComponentProps) {
  const detail = error instanceof Error ? error.message : String(error)
  return (
    <div className="mx-auto max-w-md p-6">
      <Card className="p-5">
        <p className="font-medium text-break">This screen could not be drawn.</p>
        <p className="mt-1 text-sm text-ink-2">
          The app hit a value it could not display. Nothing in the ledger has
          changed, and the record itself is unaffected - the rest of the app
          still works, and the entry can be read from the ledger.
        </p>
        {/*
          * The message is shown, not hidden behind a toggle. A resident who
          * reports this to the committee is the only way we hear about it, and
          * "something went wrong" is not reportable. It carries no personal
          * data: these throws name a field and a type, never a value.
          */}
        <p className="mt-3 break-words rounded-lg bg-sunken p-3 font-mono text-xs text-ink-2">{detail}</p>
        {/*
          * size md, not sm: sm is h-9 (36px) and the tap-target floor is 44px.
          * That floor is about the size of a finger, so it does not bend for a
          * screen that is already in a failure state - this is the one screen
          * where a mis-tap is most likely and least recoverable.
          */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={reset}>Try this screen again</Button>
          <Button tone="ghost" onClick={() => { location.href = '/' }}>Go to the dashboard</Button>
        </div>
      </Card>
    </div>
  )
}

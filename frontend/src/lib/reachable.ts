/*
 * Why a read or a write did not produce an answer, separated from what the
 * answer said.
 *
 * This module imports nothing. It is read by `components/ui.tsx`, which must
 * not pull the Supabase SDK into the shared UI chunk - the client lives
 * behind a lazy Proxy in `supabase.ts`, but the import graph is what the
 * bundler splits on, not the call graph, so importing a class from there puts
 * the whole SDK in the entry path and the standing bundle budget is the thing
 * that would notice.
 */

/** A refusal the server wrote for the person reading it. */
export class Refused extends Error {}

/**
 * The request never reached the server, or its answer never arrived whole.
 *
 * Distinct from `Refused`, which is the server's own words about something it
 * declined to do, and from a bare `Error`, which is ours. The difference is
 * what the reader should do: a refusal will happen again, this may not, so it
 * is the one case worth offering a retry for.
 *
 * It also stops a network failure borrowing a refusal's voice. `res.json()`
 * on a truncated response used to fall into `?? 'The server could not do
 * that.'` - telling a treasurer the server declined when the connection
 * dropped mid-answer, on the stated device target of a mid-range Android on
 * working 4G, where that is the common case and not the rare one.
 */
export class Unreachable extends Error {}

/*
 * Whether a thrown value is a connection failure rather than an answer.
 *
 * `fetch` rejects with a TypeError for a DNS failure, a refused connection, a
 * dropped request and a CORS rejection, and the message differs per browser
 * ("Failed to fetch", "NetworkError when attempting to fetch resource",
 * "Load failed"). So this tests what the value IS, not what it says: matching
 * on the message would silently stop working the day a browser rewords one,
 * which is the kind of check that reports success forever.
 *
 * An abort is excluded, and needs no clause to exclude it: `AbortError` is a
 * `DOMException`, never a `TypeError`, so it already falls through. Writing
 * `e instanceof DOMException ? false : ...` would read like a guard while
 * being unable to change any answer - a check that cannot fail. The test
 * asserts the behaviour instead.
 */
export const unreachable = (e: unknown): boolean =>
  e instanceof Unreachable || e instanceof TypeError

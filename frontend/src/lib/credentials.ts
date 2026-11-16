/*
 * What the sign-in screen is allowed to send, decided here rather than in the
 * component.
 *
 * `type="email" required` and `maxLength={6}` are the browser's opinion, and
 * the browser is not the only caller: constraint validation does not run on a
 * programmatic submit, differs between engines, and is simply absent once
 * anyone drives the form from the console or a test. A rule that only exists
 * as a DOM attribute is a rule that holds on most paths, which for an
 * authentication boundary is the same as not holding.
 *
 * These live in lib/ so they can be tested without mounting a router, which is
 * the project rule and the reason this file exists at all rather than two
 * `if`s inside `Login.tsx`.
 *
 * NEITHER OF THESE IS AUTHORISATION. They stop a request that cannot possibly
 * succeed from being sent; the server decides who may sign in, and the app
 * still refuses an address with no society account after the code verifies.
 * Nothing here should ever grow into a client-side permission check - see the
 * scope rule: the client never gets a second opinion about access.
 */

/** A code is exactly six digits. Not five, not six-with-a-space. */
export const CODE_LENGTH = 6

export type Check = { ok: true; value: string } | { ok: false; reason: string }

/*
 * Deliberately permissive, and the comment matters more than the pattern.
 *
 * There is no regular expression that matches exactly the deliverable
 * addresses, and every attempt to write a strict one rejects somebody real -
 * apostrophes, plus-addressing, long or new TLDs, IDNs. The cost of a false
 * rejection here is a resident who cannot sign in at all and has no way to
 * argue with the form; the cost of a false acceptance is one email that
 * bounces. So this rejects only what cannot be an address, and leaves the rest
 * to the mail server, which is the only thing that actually knows.
 */
const SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Normalises and shape-checks an address.
 *
 * Trims and lowercases, and returns THAT value for sending, so the address
 * checked is the address used. Returning only `ok` and letting the caller
 * re-derive the string is how the two drift apart.
 */
export function checkEmail(raw: string): Check {
  const value = raw.trim().toLowerCase()
  if (!value) return { ok: false, reason: 'Enter the email your committee registered.' }
  if (!SHAPE.test(value)) return { ok: false, reason: 'That does not look like an email address.' }
  return { ok: true, value }
}

/**
 * Checks a one-time code.
 *
 * Rejects before the request because a wrong-length code cannot verify, and
 * spending an attempt on it is a real cost: providers rate-limit verification,
 * so a few stray submissions can lock out the person who is typing carefully.
 *
 * Non-digits are rejected rather than stripped. Stripping would turn an
 * obvious mistype into a plausible-looking code and spend the attempt anyway.
 */
export function checkCode(raw: string): Check {
  const value = raw.trim()
  if (!value) return { ok: false, reason: 'Enter the code from the email.' }
  if (!/^\d+$/.test(value)) return { ok: false, reason: 'The code is six digits.' }
  if (value.length !== CODE_LENGTH) {
    return { ok: false, reason: `The code is ${CODE_LENGTH} digits; this is ${value.length}.` }
  }
  return { ok: true, value }
}

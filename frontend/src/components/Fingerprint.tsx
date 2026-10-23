import { Link } from '@tanstack/react-router'

/**
 * An entry's short fingerprint, with the honest caveat attached.
 *
 * The caveat is not hedging, it is the product's actual claim. A short
 * fingerprint is a convenience for reading aloud and comparing by eye;
 * it is NOT proof on its own, because a short value can collide. The
 * long value belongs on anything printed or exported, and the sentence
 * here says where the real check happens rather than letting eight hex
 * characters imply a guarantee.
 *
 * Wording discipline, same force as everywhere else in the product: the
 * record can be checked, and a change would show. Never that it cannot
 * be forged by whoever runs the server.
 *
 * Rendered in the mono face loaded on this route and the verify route
 * only — a third family on the ledger buys nothing.
 */

export function Fingerprint({
  value,
  sequence,
}: {
  readonly value: string
  readonly sequence: number
}) {
  return (
    <div className="max-w-[68ch]">
      <p className="m-0 text-meta text-ink-quiet">
        Short reference for entry{' '}
        <span className="cf-tabular">#{sequence}</span>
      </p>

      {/*
       * Grouped in fours and spaced, so it can be read out over a phone
       * and compared character by character without losing the place.
       * letter-spacing is on the container, not faked with inserted
       * spaces, so a copy-paste gives the real value.
       */}
      <p className="mt-(--cf-s1) mb-0 font-mono tracking-[0.12em] break-all select-all">
        {value}
      </p>

      <p className="mt-(--cf-s2) mb-0 text-meta text-ink-quiet">
        This short reference is for reading and comparing by eye. The full
        reference is on every printed and exported report.{' '}
        <Link
          to="/verify"
          className="text-anchor underline decoration-1 underline-offset-2"
        >
          Check this record against the published copy
        </Link>
        .
      </p>
    </div>
  )
}

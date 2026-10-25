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
 * Rendered in the PLATFORM monospace stack (`--cf-mono`), not a
 * webfont. No mono face is loaded anywhere in the app, deliberately: a
 * third family costs payload on the resident read path, and the only
 * job the mono does here is making the characters even width so two
 * values can be compared by eye. The platform stack does that.
 *
 * So nothing in this component depends on a font download, and nothing
 * that does should be added to it.
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
      <p className="m-0 font-label-code-sm text-label-code-sm text-on-surface-variant">
        Short reference for entry{' '}
        <span className="cf-tabular">#{sequence}</span>
      </p>

      {/*
       * NOT grouped into blocks. letter-spacing only, which widens the
       * gaps evenly so the eye can walk the value character by
       * character.
       *
       * Grouping in fours would read better aloud, and the comment here
       * used to claim it did. It cannot be done by inserting spaces
       * into the text: `select-all` exists so a resident can copy this
       * value and paste it somewhere to compare, and a copied value
       * carrying spaces that are not in the real fingerprint matches
       * nothing. Real grouping needs the value split into spans with
       * CSS gaps and a clean copy path, which is a change to make
       * deliberately rather than to imply in a comment.
       */}
      <p className="mt-space-sm mb-0 font-label-code-md tracking-[0.12em] break-all select-all">
        {value}
      </p>

      <p className="mt-space-md mb-0 font-label-code-sm text-label-code-sm text-on-surface-variant">
        This short reference is for reading and comparing by eye. The full
        reference is on every printed and exported report.{' '}
        <Link
          to="/verify"
          className="text-on-primary-fixed-variant underline decoration-1 underline-offset-2"
        >
          Check this record against the published copy
        </Link>
        {'.'}
      </p>
    </div>
  )
}

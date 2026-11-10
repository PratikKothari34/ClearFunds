import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * NO SURFACE DECIDES FROM A RAW `.minor` - SWEPT OVER THE SOURCE, NOT ONE
 * FILE.
 *
 * `null <= 0` is TRUE and `null > 0` is FALSE, so a figure the server could
 * not supply takes the same branch as a real number and the screen states
 * something nothing computed. It has now happened three times:
 *
 *   - `/dues` dropped an unreadable flat from the treasurer's owing filter,
 *     so the count came out too LOW - telling a treasurer to stop chasing;
 *   - the AGM report labelled an unreadable surplus **Surplus for the year**,
 *     a claim about the society's finances, in the document the chain exists
 *     to support;
 *   - the same report hid "Advances from members" entirely when the figure
 *     could not be read, because `null > 0` is false, so a balance-sheet row
 *     vanished rather than disclosing.
 *
 * Each was found by reading a file. `countable.test.ts` proves the GATE is
 * correct; nothing proved every surface goes through it, and a correct gate
 * that a screen bypasses guards nothing. So this reads the source.
 *
 * WHY A TEXT SWEEP RATHER THAN A TYPE. The fields arrive from the server and
 * are declared `number`, so the compiler is satisfied at every one of these
 * sites - a type is a declaration ABOUT server data, never a proof. Making
 * them `number | null` in `types.ts` would be the stronger fix and is the
 * right ask for the backend contract; until the contract says so, a
 * declaration this lane writes about data it does not produce is a cast with
 * extra steps.
 *
 * THE ALLOWLIST IS THE POINT, NOT AN ESCAPE HATCH. Five sites compare a raw
 * `.minor` correctly because each sits AFTER a `countable()` gate has narrowed
 * the value to a number. The rule is "no comparison BEFORE the gate", not "one
 * file touches the field", so those are named here with the reason. A new
 * entry means someone has to write down why their comparison is safe.
 */

const root = resolve(__dirname, '..')

/*
 * A sweep that matches nothing must FAIL. A renamed directory or a changed
 * field suffix would otherwise retire this check silently and it would report
 * success forever - the same failure mode as a bundle budget whose pattern
 * stops matching.
 */
function sources(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...sources(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/**
 * Sites where a raw `_minor` comparison is correct because a `countable()`
 * gate has already narrowed the value. Keyed by file, with the reason.
 */
const GATED: Record<string, string> = {
  'components/ui.tsx': 'compares inside Amount, after countable() has thrown on unreadable',
  'lib/allocation.ts': 'compares Line.minor, a value this module computed itself',
  'lib/reversed.ts': 'takes unknown on purpose and gates before every comparison',
  'lib/countable.ts': 'IS the gate - it compares after proving readability',
  'lib/spend.ts': 'refuses a non-safe-integer amount before every ordered comparison',
}

const files = sources(root)

describe('no surface decides from a raw .minor', () => {
  it('finds source files to sweep at all', () => {
    // Without this, every assertion below passes vacuously on an empty list.
    expect(files.length, 'the sweep matched no source files - it has stopped measuring')
      .toBeGreaterThan(20)
  })

  it('finds the money fields it is meant to be sweeping', () => {
    // And without this, a renamed suffix silently empties the sweep.
    const withMinor = files.filter((f) => /_minor/.test(readFileSync(f, 'utf8')))
    expect(withMinor.length, 'no file mentions a _minor field - the suffix changed')
      .toBeGreaterThan(5)
  })

  it('compares a _minor field only in a file that gates first', () => {
    /*
     * Matches an ordered comparison against a `_minor` field, in either
     * operand order. Equality is not matched: `x === null` is a readability
     * test, not a decision taken on a figure.
     *
     * The operator is guarded against `=>`, `<=`, `!=`, `>>` and friends.
     * Without that guard the first run flagged
     * `partition(rows, (d) => d.outstanding_minor)` - the arrow read as a
     * `>` comparison, so the sweep's loudest finding was the very code that
     * FIXED this bug class. A guard whose first report is a false positive
     * on correct code gets switched off, which is how a real one goes with
     * it.
     */
    const OP = '(?:<=|>=|(?<![=!<>|&+*/-])<(?!=)|(?<![=!<>|&+*/-])>(?!=))'
    const FIELD = '[\\w.?\\[\\]]*_minor'
    const CMP = new RegExp(`${FIELD}\\s*${OP}|${OP}\\s*${FIELD}\\b`)

    const offenders: string[] = []
    for (const f of files) {
      const rel = relative(root, f).replace(/\\/g, '/')
      if (rel in GATED) continue
      const lines = readFileSync(f, 'utf8').split('\n')
      let inBlock = false
      lines.forEach((raw, i) => {
        // Comments describe these bugs at length; the code is what is swept.
        const line = raw.replace(/\/\/.*$/, '')
        if (inBlock) {
          if (line.includes('*/')) inBlock = false
          return
        }
        if (/\/\*/.test(line) && !/\*\//.test(line)) {
          inBlock = true
          return
        }
        const code = line.replace(/\/\*.*?\*\//g, '').replace(/^\s*\*.*$/, '')
        if (CMP.test(code)) offenders.push(`${rel}:${i + 1}  ${code.trim()}`)
      })
    }

    expect(
      offenders,
      'A raw _minor comparison decides a branch before countable() has proven ' +
        'the figure is readable. `null <= 0` is true and `null > 0` is false, so ' +
        'an unsupplied figure takes a real number\'s branch: a flat that owes ' +
        'reads as paid, an unreadable surplus reads as "Surplus for the year", ' +
        'and a balance-sheet row disappears. Use countable(), owing(), ' +
        'partition() or direction(), or add this file to GATED with the reason ' +
        'its comparison is already narrowed.',
    ).toEqual([])
  })

  it('keeps every allowlisted file real, so the list cannot rot', () => {
    /*
     * An allowlist entry for a file that no longer exists, or that no longer
     * compares a `_minor` at all, is a stale exemption - and the next file
     * renamed into that path inherits it silently.
     */
    const present = new Set(files.map((f) => relative(root, f).replace(/\\/g, '/')))
    for (const rel of Object.keys(GATED)) {
      expect(present.has(rel), `${rel} is allowlisted but no longer exists - drop the entry`)
        .toBe(true)
      expect(
        /[._]minor\b/.test(readFileSync(resolve(root, rel), 'utf8')),
        `${rel} is allowlisted but no longer mentions a minor field - drop the entry`,
      ).toBe(true)
    }
  })
})

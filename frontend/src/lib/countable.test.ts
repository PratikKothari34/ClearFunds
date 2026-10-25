import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addableCount,
  isOutstanding,
  isShowableCount,
  isUnreadableAmount,
  isUnreadableCount,
} from './countable'

/*
 * NaN IS THE WHOLE POINT, and the reason the predicate exists rather
 * than `count > 0` being written at each site: every comparison against
 * NaN is false, so the obvious spelling passes it straight through and
 * the surface renders the word "NaN" where a quantity belongs.
 */
describe('isShowableCount', () => {
  it('accepts a positive whole count', () => {
    for (const n of [1, 2, 40, 41, 1000]) {
      expect(isShowableCount(n), String(n)).toBe(true)
    }
  })

  it('refuses NaN, which every comparison lets through', () => {
    expect(isShowableCount(NaN)).toBe(false)
    // The shapes NaN actually arrives in: arithmetic on a missing
    // field, and a non-numeric string coerced with +.
    expect(isShowableCount(0 - Number(undefined))).toBe(false)
    expect(isShowableCount(+'' + Number('x'))).toBe(false)
  })

  it('refuses zero, because no badge is not the same as a zero badge', () => {
    expect(isShowableCount(0)).toBe(false)
    expect(isShowableCount(-0)).toBe(false)
  })

  it('refuses a negative count', () => {
    for (const n of [-1, -40]) {
      expect(isShowableCount(n), String(n)).toBe(false)
    }
  })

  it('refuses a fraction, because the figure was computed wrongly', () => {
    for (const n of [0.5, 2.5, 1.0000001]) {
      expect(isShowableCount(n), String(n)).toBe(false)
    }
  })

  it('refuses Infinity and non-numbers', () => {
    for (const v of [Infinity, -Infinity, '3', null, undefined, {}, [], true]) {
      expect(isShowableCount(v), JSON.stringify(v) ?? 'undefined').toBe(false)
    }
  })
})

describe('addableCount', () => {
  it('passes a usable count through unchanged', () => {
    expect(addableCount(7)).toBe(7)
  })

  it('contributes nothing for anything unusable', () => {
    for (const v of [NaN, undefined, null, -1, 0, 2.5, '3', Infinity]) {
      expect(addableCount(v), JSON.stringify(v) ?? 'undefined').toBe(0)
    }
  })

  it('never lets one bad term destroy the rest of a sum', () => {
    /*
     * THE REASON THE SECOND FUNCTION EXISTS. The More badge sums the
     * counts of the items it hides, and `NaN + n` is NaN for the whole
     * remainder of a reduction - so one unusable figure made the entire
     * aggregated badge vanish, hiding every other item's count too.
     *
     * Asserting against the sum of the usable terms, not a written
     * number: editing an expected figure is how this test would be
     * "fixed" into meaning nothing.
     */
    const raw: readonly unknown[] = [3, NaN, 5, undefined, -2]
    const usable = raw.filter((v): v is number => isShowableCount(v))
    expect(raw.reduce<number>((n, v) => n + addableCount(v), 0)).toBe(
      usable.reduce<number>((n, v) => n + v, 0),
    )
  })
})

describe('no surface asks this question its own way', () => {
  it('is the only spelling of a showable count', () => {
    /*
     * Read from the SOURCE, because the drift was invisible from inside
     * any one file: `NavBadge` had the correct guard and four other
     * surfaces each had a weaker one, every single one of which looked
     * right where it sat. Three of the five are route files or JSX,
     * which is where a count reaches a resident.
     */
    /*
     * Two lists, because the files play two different parts.
     *
     * A DECIDING file asks the question itself and must ask it through
     * the shared predicate. A FORWARDING file only looks a count up in
     * a per-route map and hands it to `NavBadge`, which decides - so it
     * must NOT re-introduce a default, but it has no reason to import
     * the predicate either. Requiring the import everywhere is what
     * made an honest forwarding file fail, and a check that flags
     * correct code gets trained away.
     */
    const deciding = [
      'src/components/NavBadge.tsx',
      'src/components/EntryRow.tsx',
      'src/components/MobileTabBar.tsx',
      'src/components/dashboard/BalanceBand.tsx',
      'src/routes/ledger.flagged.tsx',
    ]
    const forwarding = ['src/components/DesktopRail.tsx']

    for (const file of [...deciding, ...forwarding]) {
      const code = readFileSync(resolve(process.cwd(), file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\/[^\n]*/g, '')

      // The control: stripping comments must not have emptied the file,
      // or every absence assertion below passes against ''.
      expect(code.length, `${file} stripped to nothing`).toBeGreaterThan(200)
      expect(code, `${file} no longer renders`).toMatch(/return/)

      /*
       * ANY ORDERING COMPARISON AGAINST A LITERAL, not a list of the
       * spellings that happened to be in the tree.
       *
       * A first version of this guard matched the three shapes it had
       * actually found - `count > 0`, `count <= 0`, `counts[x] ?? 0`.
       * Two mutations walked straight through it: `(count as number) >
       * 0`, where the cast sits between the identifier and the
       * operator, and `entryCount >= 0`, an operator that was simply
       * not in the list. Enumerating the ways to get this wrong is a
       * losing game - the same lesson `flags.test.ts` records.
       *
       * So the rule is blunt: in these files a count is never compared
       * against a numeric literal with <, >, <= or >=. The predicate
       * answers "is there something to show", and the only other
       * question anyone asks of a count here is `=== 1`, for singular
       * versus plural, which is an equality test and allowed.
       *
       * `more.length > 0` is a LIST length, not a count from the
       * server, so lengths are exempted by name - an array's length is
       * an integer by construction and cannot be NaN.
       */
      const comparisons = (
        code.match(/[A-Za-z_$][\w$.\]]*\s*(?:as\s+\w+\s*\)?\s*)?[<>]=?\s*-?\d/g) ??
        []
      ).filter((m) => !/\.length\s*[<>]=?\s*\d$/.test(m))
      expect(
        comparisons,
        `${file} compares a count against a number instead of using the predicate`,
      ).toHaveLength(0)

      /*
       * And the `??` default, which is a different mistake: it is not a
       * comparison, it silently substitutes a figure. NaN is neither
       * null nor undefined, so it is not even caught - the default only
       * manufactures a zero where nothing was known.
       */
      expect(
        code.match(/counts\[[^\]]*\]\s*\?\?/g) ?? [],
        `${file} defaults a count with ??, which does not catch NaN`,
      ).toHaveLength(0)
      expect(
        code.match(/Number\.isInteger/g) ?? [],
        `${file} rewrites the integer check instead of importing it`,
      ).toHaveLength(0)
    }

    // And a deciding file must actually use the shared predicate, so
    // the absence checks above cannot pass on a file that stopped
    // counting altogether.
    for (const file of deciding) {
      const code = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(code, `${file} does not use the shared predicate`).toMatch(
        /isShowableCount|addableCount/,
      )
    }
  })
})

/*
 * `isUnreadableCount`, and the one surface whose failure direction is
 * the opposite of every other.
 *
 * The distinction this guards is easy to lose in a refactor that
 * "simplifies" it to `!isShowableCount`, which would make a legitimate
 * zero unreadable - and then every clean month would warn the
 * president about questions nobody asked. Both directions are asserted
 * for that reason.
 */
describe('isUnreadableCount', () => {
  it('is true for everything a count cannot be', () => {
    for (const value of [
      NaN,
      0 - Number(undefined),
      Infinity,
      -Infinity,
      -1,
      -3,
      2.5,
      undefined,
      null,
      '3',
      '',
      {},
      [],
      true,
    ]) {
      expect(isUnreadableCount(value), String(value)).toBe(true)
    }
  })

  it('is false for a readable count, zero included', () => {
    /*
     * ZERO IS READABLE. It is the answer "nothing outstanding", which
     * is a fact rather than a gap - and treating it as unreadable
     * would warn about questions on every month that has none.
     */
    for (const value of [0, 1, 2, 847]) {
      expect(isUnreadableCount(value), String(value)).toBe(false)
    }
  })

  it('is not the negation of isShowableCount', () => {
    // The whole reason it exists. If this ever holds, the two have
    // been collapsed and the zero case has been lost.
    expect(isUnreadableCount(0)).toBe(false)
    expect(isShowableCount(0)).toBe(false)
  })
})

describe('the sign-off decision fails loud, not silent', () => {
  /*
   * Asserted against the ROUTE SOURCE, because `autoCodeSplitting`
   * rewrites every file under `routes/` into a lazy reference - a test
   * that imports `Route.component` renders an empty container and every
   * absence assertion passes against ''. The rule itself lives in
   * `lib/` above and is tested by behaviour there; what cannot be
   * tested any other way is that this particular surface asks the
   * loud question rather than the silent one.
   */
  const src = readFileSync(resolve(process.cwd(), 'src/routes/sign-off.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/[^\n]*/g, '')

  it('reads the route, which is the control', () => {
    expect(src.length).toBeGreaterThan(500)
    expect(src).toMatch(/openFlagCount/)
  })

  it('never compares openFlagCount with a bare operator', () => {
    /*
     * `NaN > 0` is false, so a bare comparison told the president the
     * month was clean while hiding the band that said otherwise. Every
     * reachable spelling is banned, not just the one that was there:
     * `> 0`, `>= 1`, `!== 0`, `> 0 === false`.
     */
    const bare = [
      ...src.matchAll(/openFlagCount\s*(===|!==|==|!=|>=|<=|>|<)\s*[^\s]/g),
    ].map((m) => m[0])
    const allowed = /openFlagCount\s*===\s*1/
    for (const hit of bare) {
      expect(
        allowed.test(hit),
        `${hit} decides from a raw count, and NaN makes it false`,
      ).toBe(true)
    }
  })

  it('warns when the count cannot be read', () => {
    expect(
      src,
      'the sign-off page no longer asks whether the question count is unreadable',
    ).toMatch(/isUnreadableCount\s*\(\s*period\.openFlagCount\s*\)/)
    expect(
      src,
      'nothing on the page tells the president the count could not be read',
    ).toMatch(/could not be read/)
  })
})

/** Comments are the reasoning, not the served copy. */
function servedRoute(route: string): string {
  return readFileSync(resolve(process.cwd(), 'src', 'routes', route), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/[^\n]*/g, '')
}

describe('isUnreadableAmount', () => {
  it('is true for everything an amount cannot be', () => {
    for (const value of [
      { minor: NaN, currency: 'INR' },
      { minor: 0 - Number(undefined), currency: 'INR' },
      { minor: Infinity, currency: 'INR' },
      { minor: -Infinity, currency: 'INR' },
      { minor: -1, currency: 'INR' },
      // Fractional minor units: `0002` makes minor units an integer
      // count, so a fraction means something divided that should not
      // have - the arithmetic this frontend is forbidden to do.
      { minor: 1250.5, currency: 'INR' },
      { minor: '125075', currency: 'INR' },
      { minor: null, currency: 'INR' },
      { minor: undefined, currency: 'INR' },
      {},
      undefined,
      null,
      42,
      'INR',
    ]) {
      expect(isUnreadableAmount(value), JSON.stringify(value)).toBe(true)
    }
  })

  it('is false for a readable amount, zero included', () => {
    /*
     * ZERO IS READABLE, and on this surface it is the commonest
     * answer: "this flat has paid". Treating it as a gap would
     * disclose a fault against every flat that is up to date.
     */
    for (const minor of [0, 1, 125075, 999999999]) {
      expect(
        isUnreadableAmount({ minor, currency: 'INR' }),
        String(minor),
      ).toBe(false)
    }
  })
})

describe('isOutstanding', () => {
  it('is true only for a readable, positive amount', () => {
    expect(isOutstanding({ minor: 125075, currency: 'INR' })).toBe(true)
    expect(isOutstanding({ minor: 1, currency: 'INR' })).toBe(true)
  })

  it('is false for zero, which is a paid flat and not a gap', () => {
    expect(isOutstanding({ minor: 0, currency: 'INR' })).toBe(false)
  })

  it('is false for an unreadable amount rather than passing it through', () => {
    /*
     * THE WHOLE POINT. `minor > 0` is false for NaN, so an unreadable
     * figure took the same branch as a paid flat and the arrears count
     * came out LOW. This asserts the rule, not a number: an unreadable
     * amount is never counted as outstanding and never counted as
     * paid - the two predicates disagree about it on purpose.
     */
    const junk = { minor: NaN, currency: 'INR' }
    expect(isOutstanding(junk)).toBe(false)
    expect(isUnreadableAmount(junk)).toBe(true)
  })

  it('splits any set of amounts three ways with nothing lost', () => {
    /*
     * Asserted as a PARTITION rather than against expected counts, so
     * adding a case to the list cannot be "fixed" by editing a number.
     * Every amount must land in exactly one of the three buckets.
     */
    const amounts: readonly unknown[] = [
      { minor: 125075, currency: 'INR' },
      { minor: 0, currency: 'INR' },
      { minor: NaN, currency: 'INR' },
      { minor: -5, currency: 'INR' },
      { minor: 2.5, currency: 'INR' },
      { minor: 1, currency: 'INR' },
    ]
    const owing = amounts.filter((a) => isOutstanding(a))
    const unreadable = amounts.filter((a) => isUnreadableAmount(a))
    const paid = amounts.filter(
      (a) => !isOutstanding(a) && !isUnreadableAmount(a),
    )

    expect(owing.length + unreadable.length + paid.length).toBe(amounts.length)
    for (const a of amounts) {
      const buckets = [
        isOutstanding(a),
        isUnreadableAmount(a),
        !isOutstanding(a) && !isUnreadableAmount(a),
      ].filter(Boolean).length
      expect(buckets, JSON.stringify(a)).toBe(1)
    }
    // Control: the list really does exercise all three, so a
    // partition over one bucket cannot pass this vacuously.
    expect(owing.length).toBeGreaterThan(0)
    expect(unreadable.length).toBeGreaterThan(0)
    expect(paid.length).toBeGreaterThan(0)
  })
})

describe('no surface compares money with a bare operator', () => {
  /*
   * THE SWEEP THE COUNT GUARDS ALREADY HAD, EXTENDED TO MONEY.
   *
   * `countable.ts`'s discipline was applied rigorously to counts and
   * not at all to amounts: every money decision in the product was a
   * bare `.minor > 0`, which is FALSE for NaN, so a flat whose
   * outstanding figure arrived unreadable took the same branch as a
   * flat that had paid and the arrears count came out LOW. A count
   * that is too low tells a treasurer to stop chasing a debt that may
   * exist - the one direction this product must never fail in.
   *
   * SWEPT OVER EVERY SOURCE FILE, DISCOVERED NOT LISTED. A hand-typed
   * file list cannot see the file nobody added to it, which is the
   * same blind spot that let `devData.test.ts` mirror an export list
   * and miss the fixture it existed to catch. The sweep walks the
   * tree, so a new route that reintroduces the spelling fails here
   * instead of shipping.
   *
   * `lib/` IS EXEMPT BY DESIGN, not by oversight: `countable.ts` and
   * `money.ts` are where a raw `.minor` is read, once, behind a name
   * that says what the answer means. That is the whole point of
   * having them.
   */
  function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...walk(full))
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
        out.push(full)
    }
    return out
  }

  const root = resolve(process.cwd(), 'src')
  const files = walk(root).filter((f) => !f.includes(join('src', 'lib')))

  it('finds the sources, which is the control', () => {
    // Without this, a bad root makes the sweep below walk an empty
    // list and assert nothing at all - a green test over no files.
    expect(files.length).toBeGreaterThan(10)
    expect(files.some((f) => f.endsWith('dues.tsx'))).toBe(true)
    expect(files.some((f) => f.endsWith('my-flat.tsx'))).toBe(true)
  })

  it('never decides from a raw .minor comparison', () => {
    const offenders: string[] = []
    for (const file of files) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\/[^\n]*/g, '')

      for (const m of code.matchAll(
        /\.minor\s*(===|!==|==|!=|>=|<=|>|<)\s*\S/g,
      )) {
        offenders.push(`${file.slice(root.length + 1)}: ${m[0]}`)
      }
    }

    expect(
      offenders,
      'a raw amount decided a branch; every comparison against NaN is false, so use isOutstanding / isUnreadableAmount',
    ).toEqual([])
  })

  it('the arrears surfaces disclose an unreadable amount', () => {
    /*
     * The sweep above proves no surface DECIDES from a raw amount. It
     * cannot prove the surface SAYS SO when it cannot read one -
     * silently dropping a flat from the arrears list passes the sweep
     * and still understates the debt. These two pages print the figure
     * a treasurer and a resident act on, so each must name the gap.
     *
     * SCOPED TO THE TRUE ARM, AND MEASURED IN WORDS. Three mutations
     * escaped a looser version of this test: blanking the cell's text,
     * flipping the two arms, and deleting the wording outright. The
     * reason each escaped is the same - the old assertions were
     * satisfied by text ELSEWHERE in the file. A check that scans past
     * the thing it is checking is not a check.
     *
     * So the arm is CUT OUT at its `:` and measured on its own, and
     * what is required of it is PROSE - several words a reader could
     * act on - not the presence of a tag and not a pinned sentence.
     * The wording stays free to improve; the obligation to say
     * something does not.
     */
    for (const route of ['dues.tsx', 'my-flat.tsx']) {
      const text = servedRoute(route)

      expect(text.length, `${route} stripped to nothing`).toBeGreaterThan(200)
      expect(text, `${route} no longer renders an amount`).toMatch(/Amount/)
      expect(text, `${route} never tests for an unreadable amount`).toMatch(
        /isUnreadableAmount/,
      )

      /*
       * WHAT THIS TEST CANNOT SEE, stated so nobody reads it as more
       * than it is: NEGATING the condition. Flipping
       * `isUnreadableAmount(x) ?` to `!isUnreadableAmount(x) ?` leaves
       * prose in the true arm and no `<Amount>` in it, so every
       * assertion here still holds while the page shows the wording to
       * every readable flat and the figure to the unreadable one. That
       * is behaviour, not spelling, and a source sweep is the wrong
       * instrument for it. `isOutstanding`'s own behaviour tests above
       * are what bound that case - a negated guard sends an unreadable
       * amount down the `isOutstanding` arm, where the unit tests
       * already pin what that function answers.
       */
      // The conditional that decides how an unreadable figure renders.
      const at = text.search(/isUnreadableAmount\([^)]*\)\s*\?/)
      expect(at, `${route} has no unreadable branch on a rendered amount`)
        .toBeGreaterThan(-1)

      /*
       * The true arm only: from the `?` to the `:` that begins the
       * readable case. Everything after that colon is the normal
       * figure and must not be allowed to satisfy this test.
       */
      const after = text.slice(at)
      const q = after.indexOf('?')
      const colon = after.indexOf(' : ')
      expect(colon, `${route} unreadable branch has no readable arm`)
        .toBeGreaterThan(q)
      const arm = after.slice(q + 1, colon)

      /*
       * `Amount` on a NaN minor prints junk beside real figures, so
       * the unreadable arm must not be one.
       */
      expect(arm, `${route} renders Amount for a figure it could not read`)
        .not.toMatch(/<Amount\b/)

      /*
       * And it must say words. Counted rather than matched, because a
       * single stray letter is not a disclosure and a blank cell reads
       * as "nothing outstanding" - the exact wrong answer.
       */
      const words = (arm.match(/>([^<>{}]+)</g) ?? [])
        .join(' ')
        .match(/[A-Za-z]{2,}/g) ?? []
      expect(
        words.length,
        `${route} shows an unreadable figure with no words: a blank cell reads as nothing outstanding`,
      ).toBeGreaterThan(2)
    }
  })
})

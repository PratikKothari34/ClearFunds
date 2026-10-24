import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addableCount, isShowableCount, isUnreadableCount } from './countable'

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

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isUnresolved, resolvedOn } from './flags'
import { unresolvedFlagCount } from './counts'
import type { FlagLogItem } from './types'

const base: FlagLogItem = {
  id: 'f-1',
  question: 'Why two lift invoices in one month?',
  raisedAt: '2026-10-21T09:12:00+05:30',
}

/*
 * The cast is the point of the test, not a shortcut around the types.
 *
 * `exactOptionalPropertyTypes` means `resolvedAt?: string` will not
 * accept `undefined` as an explicit value, and the type says nothing
 * about `""` or a number. But the predicate exists for values the TYPE
 * cannot rule out: this payload comes off the wire, where "" is what a
 * form submits for an untouched date and null is what a serialiser
 * emits for an empty column. A guard that only accepted well-typed
 * inputs would be testing the compiler instead of the runtime.
 */
function withResolved(value: unknown): FlagLogItem {
  return { ...base, resolvedAt: value } as FlagLogItem
}

/*
 * THE EMPTY STRING IS THE WHOLE POINT.
 *
 * Four surfaces asked whether a question was answered, in three
 * different spellings, and they disagreed on exactly one input:
 * `resolvedAt: ""`, which `== null` called unresolved and truthiness
 * called answered. So one question was counted in the badge residents
 * are shown AND filed under "Answered" on the page, printing the word
 * with no date after it.
 */
describe('isUnresolved', () => {
  it('treats a real timestamp as answered', () => {
    expect(isUnresolved(withResolved('2026-10-22T10:00:00+05:30'))).toBe(false)
  })

  it('treats an absent value as unanswered', () => {
    expect(isUnresolved(withResolved(undefined))).toBe(true)
    expect(isUnresolved(withResolved(null))).toBe(true)
  })

  it('treats a blank value as unanswered, not answered', () => {
    /*
     * The case the four surfaces disagreed about. "" is what a form
     * submits for an untouched date field, so this is a normal input
     * rather than an edge one.
     */
    for (const blank of ['', ' ', '\t', '\n', '   ']) {
      expect(isUnresolved(withResolved(blank)), JSON.stringify(blank)).toBe(true)
    }
  })

  it('errs towards unanswered for anything unusable', () => {
    /*
     * THE DIRECTION IS THE RULE, not the list. Over-reporting an open
     * question is a resident checking something already settled;
     * under-reporting is an unanswered question about a payment,
     * invisible behind a figure saying there is nothing to chase.
     */
    for (const junk of [0, 1, false, true, {}, [], NaN]) {
      expect(isUnresolved(withResolved(junk)), JSON.stringify(junk)).toBe(true)
    }
  })
})

describe('resolvedOn', () => {
  it('hands back the timestamp it accepted', () => {
    const when = '2026-10-22T10:00:00+05:30'
    expect(resolvedOn(withResolved(when))).toBe(when)
  })

  it('hands back null for everything isUnresolved rejects', () => {
    /*
     * Derived from the other predicate rather than listed again: if
     * the two ever disagree, a surface can say "Answered" about a
     * question the badge counts as open, which is the original bug
     * reappearing between these two functions instead of between four
     * files.
     */
    for (const value of [undefined, null, '', '  ', 0, {}]) {
      const flag = withResolved(value)
      expect(resolvedOn(flag) === null, JSON.stringify(value)).toBe(
        isUnresolved(flag),
      )
    }
  })

  it('never returns a value that would print as an empty date', () => {
    // A caller does `Answered ${resolvedOn(f)}`. Anything blank that
    // got through would render the word with nothing after it.
    for (const value of ['', ' ', '\t']) {
      expect(resolvedOn(withResolved(value))).toBeNull()
    }
  })
})

describe('the count and the pages cannot disagree again', () => {
  it('counts a blank resolution as open, like every page now does', () => {
    const flags = [
      withResolved('2026-10-22T10:00:00+05:30'),
      withResolved(''),
      withResolved(undefined),
    ]
    /*
     * Asserting the RULE, not the number: the count is whatever
     * `isUnresolved` says, so editing the expected figure cannot make
     * this pass while the two drift apart.
     */
    expect(unresolvedFlagCount(flags)).toBe(flags.filter(isUnresolved).length)
    // And the blank one is on the open side, which is the direction
    // that matters.
    expect(unresolvedFlagCount(flags)).toBe(2)
  })

  it('is the only spelling of the question in the codebase', () => {
    /*
     * Read from the SOURCE, because the drift was never visible from
     * inside any one file - each spelling looked correct where it sat.
     * Two of the four surfaces are route files, which cannot be
     * rendered in a test at all, so this is the only check that can
     * see all four.
     */
    const files = [
      'src/lib/counts.ts',
      'src/routes/disputes.tsx',
      'src/routes/my-flat.tsx',
      'src/components/FlagHistory.tsx',
    ]
    for (const file of files) {
      const code = readFileSync(resolve(process.cwd(), file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
      // The control: stripping must not have emptied the file.
      expect(code.length, `${file} stripped to nothing`).toBeGreaterThan(200)
      /*
       * NO MENTION OF THE FIELD AT ALL, which is a blunter rule than
       * "no truthiness test" on purpose.
       *
       * A first version of this guard matched the specific shapes the
       * three spellings happened to take - `resolvedAt ==`, and a
       * `!x.resolvedAt` with a bracket before it. A mutation that put
       * back `.filter((i) => i.resolvedAt)` walked straight through
       * both, because there is no `!` or `(` immediately before the
       * identifier there. Enumerating the ways to misread a field is a
       * losing game; `resolvedOn` is the only thing allowed to read it,
       * so outside flags.ts the field name simply does not appear.
       */
      expect(
        code.match(/\.resolvedAt/g) ?? [],
        `${file} reads resolvedAt directly - use isUnresolved or resolvedOn`,
      ).toHaveLength(0)
    }
  })
})

/*
 * THE FILTER A URL MAY NAME, AND THE TABS THAT DISPLAY IT.
 *
 * `/ledger?f=` was read with `s.f as Filter` - a cast, so any string in the
 * address bar became a Filter. The row switch defaults to showing everything,
 * which is safe, but the SAME value drives `Segmented`, a role="tablist"
 * that sets aria-selected on the tab whose value matches. An unrecognised
 * filter therefore left every tab aria-selected="false": invalid ARIA, and a
 * screen reader announces no current filter while the list shows every row.
 *
 * Two lists in one file have to agree - the set the validator accepts and the
 * set the tablist can display. Neither is derived from the other, so this
 * reads both out of the source and fails in either direction: a filter the
 * URL may set with no tab to select, or a tab no URL can reach.
 *
 * Read from source rather than imported because the route module pulls in the
 * router, the virtualizer and the whole component tree. The rule being
 * guarded is the agreement between two literal lists, which is visible in the
 * text; mounting a router to see it would test less, not more.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '../routes/ledger.tsx')
const src = readFileSync(SRC, 'utf8')

/** The list the search validator checks against. */
const declared = (): string[] => {
  const m = /const FILTERS = \[([^\]]+)\] as const/.exec(src)
  if (!m) throw new Error('no FILTERS array in ledger.tsx')
  return [...m[1]!.matchAll(/'([a-z]+)'/g)].map((x) => x[1]!)
}

/** The values the Segmented tablist can render a selected tab for. */
const tabs = (): string[] => {
  const m = /options=\{\[([\s\S]*?)\]\}/.exec(src)
  if (!m) throw new Error('no Segmented options in ledger.tsx')
  return [...m[1]!.matchAll(/value: '([a-z]+)'/g)].map((x) => x[1]!)
}

describe('the ledger filter a URL may name', () => {
  it('finds both lists, so the comparison below is not vacuous', () => {
    // Renaming FILTERS or restructuring the options would otherwise make
    // every assertion here compare two empty arrays and pass.
    expect(declared().length).toBeGreaterThan(1)
    expect(tabs().length).toBeGreaterThan(1)
  })

  it('accepts exactly the filters the tablist can show as selected', () => {
    /* Either direction is the defect: a filter the URL may set with no tab
     * leaves the tablist with nothing aria-selected, and a tab no URL can
     * reach is a control that silently loses its state on a reload. */
    expect(declared().toSorted()).toEqual(tabs().toSorted())
  })

  it('keeps a filter only when it IS in the list, never when it is not', () => {
    /* The defect itself, and its inversion. `s.f as Filter` typechecks and
     * admits anything; `!FILTERS.includes(...)` is worse still, admitting
     * ONLY values no tab can show while dropping every real filter - and a
     * test that merely looks for `FILTERS.includes` stays green on both. So
     * the check is matched with the negation explicitly excluded. */
    const strip = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const line = strip.split('\n').find((l) => l.includes('f: s.f'))
    expect(line, 'no line assigning f from the search params').toBeDefined()
    expect(line).toMatch(/\(\s*FILTERS\.includes\(/)
    expect(line, 'the membership check is negated').not.toMatch(/!\s*FILTERS\.includes/)
  })

  it('still defaults to showing every row when no filter is named', () => {
    // The fallback is 'all', and dropping an unknown value relies on it.
    expect(declared()).toContain('all')
    expect(src).toMatch(/search\.f \?\? 'all'/)
  })
})

import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TITLE_SUFFIX, titleFor, titledPaths } from './titles'

describe('titleFor', () => {
  it('names the surface before the society', () => {
    /*
     * ORDER MATTERS AND IS NOT COSMETIC. A tab strip truncates from the
     * right, so the part that differs between tabs has to come first.
     * Asserted as "not starting with the suffix" rather than by matching
     * the whole string, so the wording of a title can change without
     * this failing.
     */
    for (const path of titledPaths()) {
      const title = titleFor(path === '/ledger/' ? '/ledger/847' : path)
      expect(title.startsWith(TITLE_SUFFIX), path).toBe(false)
      expect(title.endsWith(TITLE_SUFFIX), path).toBe(true)
    }
  })

  it('gives every path its own title', () => {
    /*
     * The failure this guards is two routes sharing one title, which is
     * the bug being fixed - fifteen routes shared "ClearFunds". A
     * duplicate is not a typo, it means one of the two surfaces cannot
     * be told apart from the other in a tab, a bookmark or an
     * announcement.
     */
    const titles = titledPaths().map((p) =>
      titleFor(p === '/ledger/' ? '/ledger/847' : p),
    )
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('prefers the most specific path', () => {
    // `/ledger/flagged` starts with `/ledger`, so an unordered lookup
    // would hand a sub-tab its parent's title.
    expect(titleFor('/ledger/flagged')).not.toBe(titleFor('/ledger'))
    expect(titleFor('/ledger/reversed')).not.toBe(titleFor('/ledger'))
    expect(titleFor('/ledger/847')).not.toBe(titleFor('/ledger'))
  })

  it('does not match the whole app on the home path', () => {
    /*
     * `/` is a prefix of EVERY path, so a plain startsWith would make
     * every route "Home". It is the one entry matched exactly.
     */
    expect(titleFor('/')).not.toBe(titleFor('/reports'))
    expect(titleFor('/approvals')).not.toMatch(/Home/)
  })

  it('falls back to the name alone for a path it does not know', () => {
    // Not the word "Unknown": an unrecognised path is our gap, and
    // narrating it to a resident tells them nothing they can act on.
    expect(titleFor('/nothing-here')).toBe(TITLE_SUFFIX)
    expect(titleFor('/nothing-here')).not.toMatch(/unknown|error|404/i)
  })

  it('never puts an entry id in a title', () => {
    // A bookmark reading "Entry 847 - ClearFunds" is unreadable a month
    // later, and the id means nothing to a resident.
    expect(titleFor('/ledger/847')).not.toMatch(/847/)
  })
})

describe('every route has a title', () => {
  it('covers each route file in the tree', () => {
    /*
     * READ FROM THE ROUTE DIRECTORY, not from a list written here.
     *
     * The whole point of the table is that a route added later cannot
     * silently fall back to the bare product name. A hand-written list
     * of expected routes would have to be updated in the same commit
     * that adds the route, which is exactly the step that gets missed.
     */
    const dir = resolve(process.cwd(), 'src/routes')
    const files = readdirSync(dir).filter(
      (f) => f.endsWith('.tsx') && !f.startsWith('__'),
    )

    // Control: the directory was actually read.
    expect(files.length).toBeGreaterThan(10)

    for (const file of files) {
      const base = file.replace(/\.tsx$/, '')
      // TanStack file routing: dots are path separators, `index` is the
      // parent path itself, and a `$param` segment stands for any value.
      const path =
        '/' +
        base
          .split('.')
          .filter((s) => s !== 'index')
          .map((s) => (s.startsWith('$') ? '847' : s))
          .join('/')

      const title = titleFor(path === '/' ? '/' : path)
      expect(title, `${file} -> ${path} has no title of its own`).not.toBe(
        TITLE_SUFFIX,
      )
    }
  })
})

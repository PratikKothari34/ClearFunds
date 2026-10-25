import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INTERNAL_PATHS, isInternalPath } from './types'

/*
 * THE ONE HAND-WRITTEN LIST THAT MIRRORS GENERATED CODE.
 *
 * `INTERNAL_PATHS` has to exist as values, because a TypeScript union
 * cannot be iterated at runtime and `isInternalPath` has to actually
 * check membership - a shape test that accepts `/nope` is a validator
 * that returns true for a path `Link` cannot navigate to.
 *
 * A hand-maintained mirror of generated code drifts. This is the test
 * that makes it not drift: it parses the `to:` union out of
 * `routeTree.gen.ts` and demands the two agree exactly. Adding a route
 * without adding it here fails, and so does removing one.
 *
 * Param routes (`/ledger/$entryId`) are excluded from the comparison,
 * not from the tree: navigating to one needs a `params` object that
 * `AttentionItem` has no field for, so accepting the pattern as an
 * href would produce a link that throws.
 */

const GEN = readFileSync(resolve(process.cwd(), 'src/routeTree.gen.ts'), 'utf8')

/** The `to:` union out of `FileRouteTypes`, as plain strings. */
function generatedToPaths(): string[] {
  const types = GEN.slice(GEN.indexOf('export interface FileRouteTypes'))
  const start = types.indexOf('\n  to:')
  expect(start, 'FileRouteTypes has no `to:` union').toBeGreaterThan(-1)
  // The union runs until the next property at two-space indent.
  const rest = types.slice(start + 1)
  const end = rest.search(/\n {2}[a-zA-Z]+:/)
  const block = end === -1 ? rest : rest.slice(0, end)
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '')
}

describe('INTERNAL_PATHS mirrors the generated route tree', () => {
  it('finds a non-empty union to compare against', () => {
    // Control: every assertion below compares two lists, and comparing
    // two empty lists passes. A parser that silently matched nothing
    // would make this whole file vacuous.
    const found = generatedToPaths()
    expect(found.length).toBeGreaterThan(5)
    expect(found).toContain('/approvals')
  })

  it('lists exactly the static routes, no more and no fewer', () => {
    const generated = generatedToPaths()
      .filter((p) => !p.includes('$'))
      .sort()
    expect([...INTERNAL_PATHS].sort()).toEqual(generated)
  })

  it('excludes param routes, which need a params object', () => {
    for (const path of INTERNAL_PATHS) {
      expect(path, `${path} is a pattern, not a navigable path`).not.toContain(
        '$',
      )
    }
    // Control: the tree really does have one, so the filter above is
    // excluding something rather than describing an empty case.
    expect(generatedToPaths().some((p) => p.includes('$'))).toBe(true)
  })
})

describe('isInternalPath', () => {
  it('accepts every path it declares', () => {
    for (const path of INTERNAL_PATHS) {
      expect(isInternalPath(path), path).toBe(true)
    }
  })

  it('rejects a scheme, another origin, and a path that is not a route', () => {
    /*
     * The last one is the case a shape check missed. The others are
     * rejected as a consequence of membership, not by a rule that has
     * to list every dangerous scheme - which is why this is a
     * membership test.
     */
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '//evil.example/approvals',
      'https://evil.example/approvals',
      /*
       * BACKSLASH-SMUGGLED HOST. Written String.raw so the
       * backslash SURVIVES: as a plain quoted string this was
       * just '/evil.example', a different input entirely, and
       * the case meant here went untested while the line read
       * as though it covered it. Browsers normalise a leading
       * backslash to a slash, so this resolves off-origin.
       */
      String.raw`/\evil.example`,
      '/approvals/../../etc/passwd',
      '/nope',
      '/ledger/$entryId',
      '',
      '.',
      '..',
    ]) {
      expect(isInternalPath(bad), `${bad} must be rejected`).toBe(false)
    }
  })

  it('rejects anything that is not a string', () => {
    // A server sending null, a number or an object must not throw here
    // and must not pass: the band drops the item either way.
    for (const bad of [null, undefined, 42, {}, [], true, { href: '/' }]) {
      expect(isInternalPath(bad)).toBe(false)
    }
  })
})

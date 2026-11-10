import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/*
 * That the three parts of dark mode still agree on ONE string, which no other
 * suite reaches.
 *
 * `'cf-theme'` is a bare literal in two files with no shared constant, so
 * renaming it in one place typechecks and every suite stays green: the
 * pre-paint bootstrap then reads a key nothing writes, and a dark-mode phone
 * flashes white on every load with nothing failing anywhere. Deleting
 * `public/theme.js` outright is the same silent failure - it is referenced
 * from `index.html`, not imported, so no build step misses it.
 *
 * tokens.test.ts guards the OTHER half: that both dark ramps exist in app.css
 * and carry the same palette. It says nothing about the key or the bootstrap,
 * because it never reads either file.
 *
 * Asserting on source text is the weaker kind of test and deliberate here, as
 * in boundary.wiring.test.ts: the decision being guarded is the literal itself,
 * so there is no function to call. Comments are stripped first - this file's
 * own prose names the key, and so does theme.js's, so a bare substring search
 * over raw text would pass on a file that only TALKS about it.
 */

const KEY = 'cf-theme'
const FRONTEND = join(import.meta.dirname, '..', '..')

function code(abs: string): string {
  const raw = readFileSync(abs, 'utf8')
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('dark mode: one storage key, three places', () => {
  const bootstrap = join(FRONTEND, 'public', 'theme.js')

  it('the pre-paint bootstrap exists at the path index.html references', () => {
    expect(existsSync(bootstrap), 'public/theme.js is gone: dark mode now flashes white before first paint').toBe(true)
    expect(readFileSync(join(FRONTEND, 'index.html'), 'utf8')).toMatch(/src=["']\/theme\.js["']/)
  })

  it('the bootstrap READS the key, before paint', () => {
    expect(code(bootstrap)).toMatch(
      new RegExp(`localStorage\\s*\\.\\s*getItem\\(\\s*['"]${KEY}['"]\\s*\\)`),
    )
  })

  it('the switch WRITES the same key', () => {
    expect(code(join(FRONTEND, 'src', 'components', 'Shell.tsx'))).toMatch(
      new RegExp(`localStorage\\s*\\.\\s*setItem\\(\\s*['"]${KEY}['"]\\s*,`),
    )
  })

  it('both sides WRITE the attribute the CSS selects on', () => {
    // A renamed key is one failure mode; a dropped attribute write is the
    // other, and app.css's `[data-theme='dark']` selector is what both feed.
    //
    // The assignment, not a mention: Shell.tsx reads `dataset.theme` twice in
    // the same component to seed its initial state, so `/dataset\.theme\s*=/`
    // alone matched a READ and survived deleting the write - verified by
    // mutation. `=` must not be `==` or `===`, hence the negative lookahead.
    for (const f of [bootstrap, join(FRONTEND, 'src', 'components', 'Shell.tsx')]) {
      expect(code(f), `${f} stopped assigning dataset.theme`).toMatch(
        /dataset\s*\.\s*theme\s*=(?!=)/,
      )
    }
  })

  it('no other spelling of the key is in the tree', () => {
    // The rename-in-one-place bug leaves BOTH strings present and both
    // assertions above green. Catch the stray.
    const files = [bootstrap, join(FRONTEND, 'src', 'components', 'Shell.tsx')]
    for (const f of files) {
      const hits = code(f).match(/['"]cf-[\w-]+['"]/g) ?? []
      for (const h of hits) expect(h.slice(1, -1), `unexpected cf- key in ${f}`).toBe(KEY)
    }
  })
})

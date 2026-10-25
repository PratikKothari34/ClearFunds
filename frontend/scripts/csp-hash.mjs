/*
 * ASSERTS THAT index.html CONTAINS NO INLINE <script> AT ALL.
 *
 * This script used to print the SHA-256 of the one inline script, which ran
 * before first paint to apply the stored dark/light theme. There is now a
 * single light theme, so that script is gone and there is nothing to hash.
 *
 * That is a STRONGER position, not a weaker one: a `script-src` with no
 * 'sha256-...' entry permits strictly less than one with it, and the value
 * can no longer drift out of sync with a backend that is not in this repo.
 *
 * So this check inverts. It fails if an inline script is ever reintroduced,
 * because the deployed CSP has no hash for it - the browser would block it
 * silently, nothing here would fail, and whatever it was doing before first
 * paint would simply stop happening in production only.
 *
 *   npm run csp-hash            report the state, and print a hash if one
 *                               is needed for the backend lane
 *   npm run csp-hash -- --check the same, non-zero if an inline script exists
 *
 * If an inline script is genuinely needed again: run without --check, hand
 * the printed value to the backend lane for `script-src`, and change this
 * file back to recording and comparing that hash.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const html = readFileSync(join(root, 'index.html'), 'utf8')

/*
 * Bare `<script>` only. The module script carries `type="module"` and `src`,
 * so it cannot match, and in dev Vite stamps a `nonce` on an inline tag,
 * which also stops it matching - correctly, since the nonce-bearing variant
 * is not what production serves.
 */
const matches = [...html.matchAll(/<script>\n([\s\S]*?)<\/script>/g)]

if (matches.length === 0) {
  console.log('csp-hash: no inline script in index.html, so no hash is needed.')
  console.log("  script-src 'self'")
  process.exit(0)
}

console.error(
  `csp-hash: found ${matches.length} inline <script> in index.html, expected 0.\n` +
    'The deployed CSP carries no script hash, so this is BLOCKED in production -\n' +
    'silently, with nothing failing here and no message in the console.\n',
)
for (const [, body] of matches) {
  const hash = `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`
  console.error(`  ${hash}`)
}
console.error(
  '\nEither remove the inline script, or hand the hash above to the backend\n' +
    'lane and change scripts/csp-hash.mjs back to recording and comparing it.',
)
process.exit(1)

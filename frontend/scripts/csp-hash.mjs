/*
 * Prints the CSP source value for every inline <script> in the built HTML.
 *
 * The hash covers the exact bytes between the tags, so it must be taken
 * from dist/index.html after the build rather than from index.html in
 * source: if any tooling ever rewrites that block, the source hash would
 * be right and the shipped page would be blocked.
 *
 * Usage: npm run build && npm run csp-hash
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const HTML = 'dist/index.html'

let html
try {
  html = readFileSync(HTML, 'utf8')
} catch {
  console.error(`${HTML} not found. Run \`npm run build\` first.`)
  process.exit(1)
}

// Inline scripts only: a src= script is covered by its own URL, not a hash.
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]

if (inline.length === 0) {
  console.log("No inline scripts. script-src does not need a hash.")
  process.exit(0)
}

console.log(`${inline.length} inline script(s) in ${HTML}:\n`)
const sources = inline.map((m) => {
  const digest = createHash('sha256').update(m[1], 'utf8').digest('base64')
  return `'sha256-${digest}'`
})
for (const s of sources) console.log(`  ${s}`)

console.log(`\nscript-src 'self' ${sources.join(' ')};`)

if (inline.length > 1) {
  console.error(
    "\nWarning: the design allows exactly one inline script, the " +
      'theme-before-paint block. More than one means something was ' +
      'added or a tool injected code — check before shipping the hashes.',
  )
  process.exit(1)
}

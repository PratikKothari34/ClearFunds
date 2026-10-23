/*
 * Fails the build when a theme token generates a utility class that
 * Tailwind already ships.
 *
 * Tailwind v4 reads the theme from CSS, so `--text-balance` produces
 * `.text-balance { font-size: ... }` — and Tailwind already ships
 * `.text-balance { text-wrap: balance }`. Both rules are emitted with
 * the same selector and the built-in wins on source order, so the
 * token silently does nothing. Nothing in the build warns about it:
 * the class exists, the CSS is valid, and the only symptom is the 39px
 * balance figure rendering at 16px.
 *
 * That cost a real diagnosis once. This makes the next one a build
 * failure instead.
 *
 * Runs against the built CSS, not the source, because only the built
 * output shows what Tailwind actually generated.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist/assets'

function builtCss() {
  const files = readdirSync(DIST).filter((f) => f.endsWith('.css'))
  if (files.length === 0) {
    console.error('No CSS in dist/assets. Run `npm run build` first.')
    process.exit(1)
  }
  return files.map((f) => readFileSync(join(DIST, f), 'utf8')).join('\n')
}

/**
 * Class selectors that appear in more than one rule, where the rules
 * declare DIFFERENT properties.
 *
 * A repeated selector is normal and fine when it is the same property
 * under different conditions — a media query, a theme selector, a
 * variant. The defect is one selector carrying two unrelated
 * properties, because then one of them is dead and the author cannot
 * tell which.
 */
/*
 * Tailwind's own `.container` is `width:100%` plus one `max-width` per
 * breakpoint, emitted as separate rules by design. That is the
 * same-intent case this check is meant to allow, but the properties
 * differ so the shape alone cannot tell. Excluded by name rather than
 * by loosening the rule, which would hide a real shadow.
 */
const BUILT_IN_MULTI_RULE = new Set(['container'])

function shadowedClasses(css) {
  const byClass = new Map()

  for (const m of css.matchAll(/\.(-?[A-Za-z][\w-]*)\{([^}]*)\}/g)) {
    const [, name, body] = m
    const props = body
      .split(';')
      .map((d) => d.split(':')[0]?.trim())
      .filter(Boolean)
      .sort()
      .join(',')
    if (!props) continue

    const seen = byClass.get(name) ?? new Set()
    seen.add(props)
    byClass.set(name, seen)
  }

  return [...byClass.entries()]
    .filter(([name, propSets]) => propSets.size > 1 && !BUILT_IN_MULTI_RULE.has(name))
    .map(([name, propSets]) => ({ name, variants: [...propSets] }))
}

/**
 * Project `cf-*` classes used in source but never defined in CSS.
 *
 * The sibling failure, and just as quiet. `cf-mono` was written in a
 * component for weeks while only `--cf-mono` the VARIABLE existed; the
 * fingerprint rendered in the body sans face, which is the one face it
 * must not use, and nothing anywhere complained. Tailwind does not warn
 * about an unknown class and neither does the browser.
 *
 * Scoped to the `cf-` prefix on purpose: those are ours and hand-written
 * in index.css, so an unmatched one is always a mistake. Tailwind's own
 * utilities are generated on demand and cannot be checked this way.
 */
function undefinedProjectClasses(css) {
  const defined = new Set(
    [...css.matchAll(/\.(cf-[\w-]+)/g)].map((m) => m[1]),
  )

  const used = new Map()
  for (const file of sourceFiles('src')) {
    const text = readFileSync(file, 'utf8')
    // Only inside className/class strings, so a `cf-` word in prose or
    // a comment is not mistaken for a class.
    for (const attr of text.matchAll(/class(?:Name)?=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g)) {
      const value = attr[1] ?? attr[2] ?? attr[3] ?? ''
      for (const token of value.split(/\s+/)) {
        // Strip Tailwind variant prefixes (`focus:cf-x`) and keep the
        // bare class.
        const bare = token.split(':').pop() ?? ''
        if (!bare.startsWith('cf-')) continue
        // `cf-s2` etc. appear as (--cf-s2) arbitrary values, not classes.
        if (bare.includes('(') || bare.includes('[')) continue
        if (!defined.has(bare)) {
          const where = used.get(bare) ?? new Set()
          where.add(file)
          used.set(bare, where)
        }
      }
    }
  }

  return [...used.entries()].map(([name, files]) => ({
    name,
    files: [...files],
  }))
}

function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(path))
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(path)
  }
  return out
}

const css = builtCss()
let failed = false

const found = shadowedClasses(css)
if (found.length > 0) {
  failed = true
  console.error('Shadowed utility classes found.\n')
  for (const { name, variants } of found) {
    console.error(`  .${name}`)
    for (const v of variants) console.error(`      declares: ${v}`)
  }
  console.error(
    '\nA theme token is generating a class Tailwind already ships. One of\n' +
      'the two rules is dead and which one depends on source order.\n' +
      'Rename the token (e.g. --text-balance -> --text-figure).',
  )
}

const missing = undefinedProjectClasses(css)
if (missing.length > 0) {
  failed = true
  console.error('\nProject classes used but never defined.\n')
  for (const { name, files } of missing) {
    console.error(`  .${name}`)
    for (const f of files) console.error(`      used in: ${f}`)
  }
  console.error(
    '\nThese render as nothing. Either the class is missing from\n' +
      'index.css, or the name is wrong -- a `--cf-x` theme token\n' +
      'generates the utility `font-x` / `text-x`, not `cf-x`.',
  )
}

if (failed) process.exit(1)

console.log('No shadowed or undefined utility classes.')

#!/usr/bin/env node
/*
 * EVERY ASSET index.html REFERENCES MUST EXIST.
 *
 * This exists because two did not. The favicon and the apple-touch icon were
 * referenced from the head and absent from public/, so every page load
 * fetched two 404s - and nothing failed. No build error, no test failure, no
 * console message a developer would notice. The page simply showed a blank
 * browser tab icon, which looks like a styling choice rather than a bug.
 *
 * It also checks the reverse for fonts: a font file present but never
 * referenced is dead weight on the resident read path, and a font referenced
 * but missing falls back to a system face, which changes every figure's
 * column width on a page whose whole point is comparable numbers.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PUBLIC = join(ROOT, 'public')

const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
const css = readdirSync(join(ROOT, 'src', 'styles'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(ROOT, 'src', 'styles', f), 'utf8'))
  .join('\n')

/*
 * Components reference public/ assets too - the logo is an <img src="/brand/
 * ...">, not an import - and those are invisible to a scan of index.html.
 * A rename there is the same silent 404 as a missing favicon, except it
 * blanks the mark on every screen in the app rather than one browser tab.
 *
 * Vite does NOT catch this: a root-absolute src is a plain string to the
 * bundler, never resolved at build time, so it builds green and breaks in
 * the browser.
 */
function sourceFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(path))
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.includes('.test.')) out.push(path)
  }
  return out
}
const sources = sourceFiles(join(ROOT, 'src'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')

let failed = false

/*
 * Root-absolute references only. A bare "./thing.png" is resolved by Vite
 * from the importing file and would be a build error if missing, so it is
 * already covered; a "/thing.png" is served straight from public/ and is the
 * one that fails silently.
 */
const referenced = new Set()
for (const source of [html, css, sources]) {
  for (const m of source.matchAll(/["'(](\/[A-Za-z0-9._\-/]+\.[a-z0-9]{2,12})["')]/g)) {
    referenced.add(m[1])
  }
}

/*
 * The manifest's icons are references too, and nothing else would catch
 * them. They are named inside a JSON file rather than in the head, so the
 * scan above cannot see them: an icon deleted or renamed would 404 only on
 * an install or an add-to-home-screen, which is exactly the path nobody
 * exercises before shipping.
 *
 * The extension bound above is 12, not 5, so that "webmanifest" matches at
 * all. A tighter bound silently skipped this file and reported success.
 */
const manifestRef = [...referenced].find((r) => r.endsWith('.webmanifest'))
if (manifestRef) {
  const manifestPath = join(PUBLIC, manifestRef)
  if (existsSync(manifestPath)) {
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (err) {
      console.error(
        `assets: FAIL  ${manifestRef} is not valid JSON (${err.message}).\n` +
          '  A browser ignores a malformed manifest silently.',
      )
      failed = true
    }
    for (const icon of manifest?.icons ?? []) {
      if (typeof icon?.src === 'string' && icon.src.startsWith('/')) {
        referenced.add(icon.src)
      }
    }
  }
}

for (const ref of [...referenced].sort()) {
  /*
   * /src/... is the module entry, which Vite rewrites to a hashed bundle at
   * build time. It is never served from public/, so checking for it there
   * reports a failure that is not one - and a check that cries wolf gets
   * removed, taking the real 404s with it.
   */
  if (ref.startsWith('/src/')) continue
  const path = join(PUBLIC, ref)
  if (existsSync(path)) {
    console.log(`assets: ok    ${ref}`)
  } else {
    console.error(
      `assets: FAIL  ${ref} is referenced but not present in public/.\n` +
        '  This produces a 404 on every page load and nothing else fails.',
    )
    failed = true
  }
}

if (referenced.size === 0) {
  /*
   * Zero references is a failure, not a pass: index.html always references
   * at least an icon, so an empty set means the pattern stopped matching and
   * this check has become a no-op that reports success forever.
   */
  console.error(
    'assets: FAIL  no root-absolute asset references were found at all.\n' +
      '  The check is no longer matching anything, so it is not checking anything.',
  )
  failed = true
}

/* Fonts: present but unreferenced is dead weight on the read path. */
const fontDir = join(PUBLIC, 'fonts')
if (existsSync(fontDir)) {
  for (const file of readdirSync(fontDir).filter((f) => f.endsWith('.woff2'))) {
    if (!css.includes(file) && !html.includes(file)) {
      console.error(
        `assets: FAIL  fonts/${file} is shipped but never referenced.\n` +
          '  An unused font is bytes a resident downloads for nothing.',
      )
      failed = true
    }
  }
}

if (failed) process.exit(1)
console.log('assets: every referenced asset is present.')

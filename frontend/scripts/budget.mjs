#!/usr/bin/env node
/*
 * BUNDLE BUDGET.
 *
 * The device assumption is a mid-range Android phone on working 4G. That
 * assumption governs BYTES AND RENDER COST ONLY - it has nothing to do with
 * the 16px figure floor or the 44px tap targets, which are about reading a
 * maintenance figure at arm's length and the size of a finger. A faster phone
 * improves neither.
 *
 * THE CEILINGS DO NOT FOLLOW THE NETWORK. They sit just above the measured
 * baseline, so a careless import trips one whatever the connection is assumed
 * to be. Raising the assumed throughput is never a reason to raise a ceiling.
 *
 * Measured GZIPPED, because that is what crosses the network. Comparing raw
 * bytes would let a large but highly compressible addition pass unnoticed.
 */
import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = join(import.meta.dirname, '..', 'dist')
const ROUTES = join(import.meta.dirname, '..', 'src', 'routes')

/*
 * Ceilings in gzipped KB, each a little above what the tree measures today.
 * A number here is a decision, so each one says what it is protecting.
 */
const BUDGETS = [
  {
    name: 'the framework entry chunk',
    match: /^index-.*\.js$/,
    maxKB: 130,
    protects:
      'React, the router and the query client. Everything a resident waits for before any content appears.',
  },
  {
    name: 'all CSS',
    match: /\.css$/,
    maxKB: 12,
    protects:
      'the single stylesheet. A full Tailwind build that stopped being purged lands here first.',
  },
  {
    /*
     * Named from src/routes/, not hand-listed.
     *
     * The hand-written list was /^(approvals|audit|chain|committee|
     * maintenance|routes|Page)-/ and named FOUR chunks that do not exist -
     * audit, chain, maintenance and Page - while missing ten that do. It
     * measured 3 of 13 routes, and the heaviest route in the tree was not
     * one of them. The row still matched three files, so the empty-match
     * guard below could never catch it: a dead NAME hides inside a live
     * ROW. Enumerating the directory is the only version of this that
     * cannot rot, because adding a route adds its ceiling.
     *
     * Deliberately NOT /^index-/. That is the framework entry chunk, which
     * has its own much larger ceiling above; the `/` route's own code lives
     * in the routes-* chunk. Matching the entry chunk here made it fail a
     * route-sized ceiling - the budget was measuring the wrong file and
     * reporting a real-looking failure. `index.tsx` is therefore excluded
     * from the names below and `routes` added in its place.
     */
    name: 'any one route chunk',
    match: routeChunkPattern(),
    maxKB: 50,
    each: true,
    /*
     * Every route must be MEASURED, not merely matched. A route whose chunk
     * is missing from dist means it was folded into another chunk - which is
     * code splitting silently going away, the thing this budget exists to
     * protect - so it fails rather than being skipped.
     */
    expect: routeChunkNames(),
    protects:
      'route-level code splitting. A route that imports a heavy library stops being a route-sized download.',
  },
  {
    /*
     * The two biggest things shipped after the entry chunk, and until now
     * NEITHER was measured by anything. `ui-*` is @supabase/supabase-js
     * (CommonJS, so it does not tree-shake: auth, realtime and storage all
     * ship whether or not they are called) and `link-*` is the router's
     * link/matching code. Together they are about as heavy as the entry
     * chunk itself.
     *
     * One shared ceiling rather than two, because the split between them is
     * the bundler's choice and not ours: a chunking change that moved bytes
     * from one to the other would otherwise read as an improvement.
     */
    name: 'the vendor chunks outside the entry',
    match: /^(ui|link)-.*\.js$/,
    maxKB: 108,
    expect: ['ui', 'link'],
    protects:
      'the Supabase client and the router. Adding a Supabase feature, or an import that pulls storage or a second client in, lands here.',
  },
]

/*
 * One chunk name per route file. TanStack file routing names the chunk after
 * the route file, with `$` dropped and the extension gone - entry.$seq.tsx
 * becomes entry._seq. `__root` is not a route and `index` is the framework
 * entry chunk's name, so the `/` route's chunk is `routes` instead.
 */
function routeChunkNames() {
  const files = readdirSync(ROUTES).filter((f) => f.endsWith('.tsx') && !f.startsWith('__'))
  if (files.length === 0) {
    console.error(
      `budget: FAIL  no route files in ${ROUTES}. The route budget would measure\n` +
        '  nothing at all, which is worse than having no route budget.',
    )
    process.exit(1)
  }
  return files
    .map((f) => f.replace(/\.tsx$/, '').replaceAll('$', '_'))
    .map((n) => (n === 'index' ? 'routes' : n))
}

function routeChunkPattern() {
  const alt = routeChunkNames()
    .map((n) => n.replaceAll('.', '\.'))
    .join('|')
  return new RegExp(`^(${alt})-[^/]*\.js$`)
}

function gzippedKB(path) {
  return gzipSync(readFileSync(path)).length / 1024
}

function assets() {
  const dir = join(DIST, 'assets')
  try {
    return readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile())
  } catch {
    return null
  }
}

const files = assets()
if (files === null) {
  console.error(
    'budget: dist/assets is missing. Run `npm run build` first - a budget\n' +
      'check that silently passes because there is nothing to measure is worse\n' +
      'than no check at all.',
  )
  process.exit(1)
}

let failed = false
const rows = []

for (const budget of BUDGETS) {
  const matched = files.filter((f) => budget.match.test(f))

  /*
   * An empty match is a FAILURE, not a pass. A renamed output or a changed
   * chunking strategy would otherwise turn this budget into a no-op that
   * reports success forever.
   */
  if (matched.length === 0) {
    console.error(
      `budget: FAIL  ${budget.name}: nothing matched ${budget.match}.\n` +
        '  The build output changed shape, so this budget is no longer measuring anything.',
    )
    failed = true
    continue
  }

  /*
   * A budget may also name the chunks it expects to find. The empty-match
   * guard above only fires when a row matches NOTHING, so a row listing ten
   * names of which three exist stays green forever - which is exactly how
   * the route budget came to measure 3 of 13 routes. This closes that.
   */
  if (budget.expect) {
    const missing = budget.expect.filter(
      (n) => !matched.some((f) => f.startsWith(`${n}-`)),
    )
    if (missing.length > 0) {
      console.error(
        `budget: FAIL  ${budget.name}: no chunk built for ${missing.join(', ')}.\n` +
          '  Either the chunk was folded into another one - code splitting going\n' +
          '  away - or it was renamed and this budget stopped measuring it.',
      )
      failed = true
    }
  }

  if (budget.each) {
    for (const file of matched) {
      const kb = gzippedKB(join(DIST, 'assets', file))
      rows.push({ label: file, kb, maxKB: budget.maxKB })
      if (kb > budget.maxKB) failed = true
    }
  } else {
    const kb = matched.reduce(
      (sum, f) => sum + gzippedKB(join(DIST, 'assets', f)),
      0,
    )
    rows.push({ label: budget.name, kb, maxKB: budget.maxKB })
    if (kb > budget.maxKB) failed = true
  }
}

for (const r of rows) {
  const verdict = r.kb > r.maxKB ? 'FAIL' : 'ok  '
  console.log(
    `budget: ${verdict}  ${r.kb.toFixed(1).padStart(6)} / ${String(r.maxKB).padStart(3)} KB gzip  ${r.label}`,
  )
}

if (failed) {
  console.error(
    '\nA ceiling sits just above the measured baseline. Something was added to\n' +
      'the resident read path. Move it behind a route-level import rather than\n' +
      'raising the number.',
  )
  process.exit(1)
}
console.log('budget: every chunk within its ceiling.')

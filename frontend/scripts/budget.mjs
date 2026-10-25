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
    name: 'any one route chunk',
    /*
     * Deliberately NOT /^index-/. That is the framework entry chunk, which
     * has its own much larger ceiling above; the `/` route's own code lives
     * in the routes-* chunk. Matching the entry chunk here made it fail a
     * route-sized ceiling - the budget was measuring the wrong file and
     * reporting a real-looking failure.
     */
    match: /^(approvals|audit|chain|committee|maintenance|routes|Page)-.*\.js$/,
    maxKB: 50,
    each: true,
    protects:
      'route-level code splitting. A route that imports a heavy library stops being a route-sized download.',
  },
]

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

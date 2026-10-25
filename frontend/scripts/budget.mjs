/*
 * Bundle budget gate.
 *
 * The design makes payload a standing budget rather than a later
 * optimization: the target is a mid-range Android on a working 4G
 * connection, and the resident read path must stay the lightest thing
 * in the product.
 *
 * This measures gzip size of the built output and fails the build if a
 * ceiling is crossed. Ceilings are set just above the measured baseline,
 * so the first careless import trips them while normal work does not.
 *
 * THE CEILINGS ARE NOT DERIVED FROM THE CONNECTION SPEED, so raising the
 * assumed throughput (1.5 -> 10 Mbps, 2026-10-25) does not raise any of
 * them. They are set against the MEASURED baseline - react 68.80 under a
 * 75 ceiling, app 1.68 under 60 - which is what makes this script catch
 * a careless import on any network. A faster assumed connection changes
 * what the printed seconds mean; it does not make a regression cheaper.
 *
 * Usage: npm run build && npm run budget
 */
import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist/assets'

// Ceilings in KB of gzip. Baseline measured with the shell built and no
// feature code: react 68.80, tanstack 32.72, app 1.68, css 2.38.
const CEILINGS = {
  react: 75,
  // Raised 40 -> 43 when the ledger was virtualized. @tanstack/react-virtual
  // is what makes a 1,000-row ledger scroll on a mid-range phone, so the
  // ~8 KB over the 32.72 baseline buys the thing the budget exists to
  // protect. Router, query and virtual are all that should be in here;
  // a jump of ~12 KB means a table or form library was pulled in.
  tanstack: 43,
  // The app chunk is the one that moves when a feature is careless, so it
  // carries the tightest headroom of the three.
  app: 60,
  css: 20,
  // Everything a first-time visitor must download before the ledger can
  // paint. This is the number that matters to a resident.
  firstPaint: 160,
}

let files
try {
  files = readdirSync(DIST)
} catch {
  console.error(`${DIST} not found. Run \`npm run build\` first.`)
  process.exit(1)
}

const gzipKb = (name) =>
  gzipSync(readFileSync(join(DIST, name)), { level: 9 }).length / 1024

const indexHtml = readFileSync('dist/index.html', 'utf8')

/*
 * Only the assets the HTML actually requests on a first load count.
 *
 * Summing every file in dist/assets was wrong and flattered nothing --
 * it OVERSTATED the figure, counting all 20 lazy route chunks plus the
 * i18n chunk that an English locale never fetches. That made firstPaint
 * read 161.83 KB against a 160 ceiling and would have been "fixed" by
 * raising the ceiling, hiding the fact that the real number had headroom
 * to spare.
 *
 * Route-level splitting is the whole point of the chunking config, so a
 * budget that cannot see it measures the opposite of what it is for.
 */
const eager = new Set(
  [...indexHtml.matchAll(/(?:href|src)="\/assets\/([^"]+)"/g)].map((m) => m[1]),
)

if (eager.size === 0) {
  console.error('No /assets/ references found in dist/index.html.')
  process.exit(1)
}

let react = 0
let tanstack = 0
let app = 0
let css = 0
let lazy = 0

for (const f of files) {
  if (!f.endsWith('.js') && !f.endsWith('.css')) continue
  const kb = gzipKb(f)

  // Deferred by design: route chunks and the i18n library. Reported for
  // visibility, never charged to first paint.
  if (!eager.has(f)) {
    lazy += kb
    continue
  }

  if (f.endsWith('.css')) css += kb
  else if (f.startsWith('react-')) react += kb
  else if (f.startsWith('tanstack-')) tanstack += kb
  else app += kb
}

const html = gzipSync(readFileSync('dist/index.html'), { level: 9 }).length / 1024
const firstPaint = react + tanstack + app + css + html

const rows = { react, tanstack, app, css, firstPaint }
const failures = []

console.log('gzip, KB:\n')
for (const [name, value] of Object.entries(rows)) {
  const ceiling = CEILINGS[name]
  const over = value > ceiling
  if (over) failures.push({ name, value, ceiling })
  console.log(
    `  ${name.padEnd(12)} ${value.toFixed(2).padStart(7)}  ceiling ${String(ceiling).padStart(4)}  ${over ? 'OVER' : 'ok'}`,
  )
}

/*
 * Not a budgeted row: deferred weight is not free, but it is paid on
 * navigation rather than on arrival. It is printed so a large number
 * here is still visible -- splitting a bloated feature out of the entry
 * chunk hides it from firstPaint without making it cheap.
 */
console.log(
  `\n  deferred (routes, i18n): ${lazy.toFixed(2)} KB, not in first paint`,
)

/*
 * 10 Mbps is the working assumption for the target connection: a
 * mid-range Android on 4G that is actually working. It was 1.5 Mbps, a
 * degraded-connection figure, which made every payload look urgent and
 * left no way to tell a real regression from the pessimism in the
 * denominator.
 *
 * One number, used twice, because two copies drift.
 */
const KBPS = 10000
const seconds = (kb) => ((kb * 8) / KBPS).toFixed(2)
console.log(`\n  first paint at ${KBPS / 1000} Mbps: ${seconds(firstPaint)} s`)
console.log(`  repeat visit (vendor cached): ${seconds(app + css + html)} s`)

if (failures.length > 0) {
  console.error('\nBudget exceeded:')
  for (const f of failures) {
    console.error(
      `  ${f.name} is ${f.value.toFixed(2)} KB, ceiling ${f.ceiling} KB`,
    )
  }
  console.error(
    '\nRaise a ceiling only with a reason. A ceiling is set just above ' +
      'the measured baseline, so crossing one means something grew, ' +
      'whatever the connection is assumed to be.',
  )
  process.exit(1)
}

console.log('\nWithin budget.')

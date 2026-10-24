/*
 * Fails the build when development fixture data reaches the production
 * bundle.
 *
 * The leak this exists to catch: lib/counts.ts computed the navigation
 * badge figures and imported lib/sample.ts to do it. __root.tsx imports
 * counts.ts, so the ENTIRE fixture — every flat number, every
 * resident's dues, every question anyone had asked — landed in the
 * entry chunk that every role, including a signed-out visitor at
 * /login, downloads before anything is rendered.
 *
 * The data is invented, so nothing real leaked. The SHAPE is the flaw:
 * at cutover the same import carries a real payload and no code change
 * marks the moment it stops being fixtures. The fix moved the fixture
 * behind `import.meta.env.DEV` in lib/devCounts.ts, which Vite
 * replaces with a literal so the dead branch is tree-shaken out.
 *
 * Tree-shaking is the part that cannot be taken on trust. It depends
 * on the fixture module having no side effects, on nothing else
 * importing it from a live path, and on the bundler agreeing — any one
 * of which a later change breaks silently, because the only symptom is
 * bytes in a file nobody reads. So this checks the built output for
 * strings that exist nowhere but the fixture.
 *
 * Runs against dist, not the source: the source is SUPPOSED to contain
 * these strings.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/*
 * Read out of the source so the exemption cannot drift from it. Parsed
 * rather than imported because this is a plain Node script with no TS
 * loader, and a build step here would make the check depend on the
 * thing it is checking.
 */
const PLACEHOLDER_SRC = readFileSync('src/lib/placeholder.ts', 'utf8')

function literalFrom(pattern, what) {
  const m = PLACEHOLDER_SRC.match(pattern)
  if (!m || m[1] === undefined) {
    console.error(
      [
        `Could not read ${what} out of src/lib/placeholder.ts.`,
        '',
        'This check exempts the placeholder viewer from the fixture scan by',
        'reading its values from source. If the shape changed, update the',
        'pattern here - do NOT hardcode the value, which is the drift this',
        'replaced.',
      ].join('\n'),
    )
    process.exit(1)
  }
  return m[1]
}

const PLACEHOLDER_FLAT = literalFrom(
  /PLACEHOLDER_FLAT\s*=\s*'([^']+)'/,
  'PLACEHOLDER_FLAT',
)
const PLACEHOLDER_SOCIETY = literalFrom(
  /societyName:\s*'([^']+)'/,
  'societyName',
)

const DIST = 'dist/assets'

/*
 * Strings that appear in the fixture and must appear nowhere else.
 *
 * Each is a resident-identifying value or a vendor name invented for
 * the sample ledger. A real deployment's data arrives over the wire, so
 * none of these may ever be compiled in.
 *
 * `A-704` is deliberately absent from this list and exempted below -
 * see the note there. It is a fixture flat, so it would otherwise
 * belong here.
 */
const FIXTURE_MARKERS = [
  'Resident A-704',
  'Resident B-305',
  'Omega Elevators',
  'Shree Sai Plumbing',
  'Billed twice by the vendor',
  'Maintenance collection, October',
]

/*
 * Deliberately NOT markers, and READ FROM THE SOURCE rather than
 * written down here.
 *
 * The placeholder viewer is not behind a DEV gate and legitimately
 * compiles in until the session endpoint exists, so its flat number and
 * society name must not fail the build. This list said `'B-402'` for a
 * while after the placeholder had moved to `A-704`, which left the
 * guard silently off for the one string it most needed to cover: a
 * fixture flat, with a dues row and an open question against it, that
 * the check exists to keep out of a build.
 *
 * So the values are imported. Changing the placeholder cannot
 * desynchronise an exemption that is derived from it, and the assertion
 * below fails if an exempted value stops appearing at all - which is
 * how the check notices that the placeholder is gone and these should
 * have become markers.
 */
const PLACEHOLDER_STRINGS = [PLACEHOLDER_FLAT, PLACEHOLDER_SOCIETY]

function builtJs() {
  let files
  try {
    files = readdirSync(DIST).filter((f) => f.endsWith('.js'))
  } catch {
    console.error(`No ${DIST}. Run \`npm run build\` first.`)
    process.exit(1)
  }
  if (files.length === 0) {
    console.error(`No JavaScript in ${DIST}. Run \`npm run build\` first.`)
    process.exit(1)
  }
  return files.map((f) => ({ name: f, text: readFileSync(join(DIST, f), 'utf8') }))
}

const found = []
for (const { name, text } of builtJs()) {
  for (const marker of FIXTURE_MARKERS) {
    if (text.includes(marker)) found.push({ name, marker })
  }
}

/*
 * The exemption is verified, not assumed.
 *
 * If a placeholder string stops appearing in the build, the placeholder
 * has been deleted or gated - at which point these two values should
 * become MARKERS, because a flat number compiled into a real
 * deployment is the thing this script exists to catch. Failing here is
 * how that transition gets noticed instead of leaving a permanent hole
 * in the scan.
 */
const missingExemptions = PLACEHOLDER_STRINGS.filter(
  (value) => !builtJs().some(({ text }) => text.includes(value)),
)

if (missingExemptions.length > 0) {
  console.error('The placeholder viewer is no longer in the bundle.\n')
  for (const value of missingExemptions) {
    console.error(`  ${JSON.stringify(value)} not found in ${DIST}`)
  }
  console.error(
    [
      '',
      'These are exempted from the fixture scan because the placeholder',
      'viewer legitimately compiles in until the session endpoint exists.',
      'If it is gone, move them into FIXTURE_MARKERS so a real flat number',
      'can never reach a production build, and delete this check.',
    ].join('\n'),
  )
  process.exit(1)
}

if (found.length > 0) {
  console.error('Development fixture data reached the production bundle.\n')
  for (const { name, marker } of found) {
    console.error(`  ${name}: ${JSON.stringify(marker)}`)
  }
  console.error(
    [
      '',
      'Something on a live import path reaches lib/sample.ts. Find it with:',
      '  npx vite build --mode production && grep -rl "Omega Elevators" dist/assets',
      '',
      'A BRANCH CANNOT REMOVE AN IMPORT. `import.meta.env.DEV` is replaced',
      'by a literal and the dead branch is dropped, but the import is',
      'hoisted first, so the module stays in the graph and its strings stay',
      'in the chunk. The mechanism that works is the `resolve.alias` in',
      'vite.config.ts, which swaps `./devData.source` for `./devData.empty`',
      'in a production build. See lib/devData.ts for the pattern.',
    ].join('\n'),
  )
  process.exit(1)
}

console.log(
  `No fixture data in ${DIST} (checked ${FIXTURE_MARKERS.length} markers).`,
)

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

const DIST = 'dist/assets'

/*
 * Strings that appear in the fixture and must appear nowhere else.
 *
 * Each is a resident-identifying value or a vendor name invented for
 * the sample ledger. A real deployment's data arrives over the wire, so
 * none of these may ever be compiled in.
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
 * Deliberately NOT markers, so this check fails only for the right
 * reason:
 *
 *   'Sunrise CHS' and 'B-402' — the placeholder viewer in
 *   routes/__root.tsx, which is not behind a DEV gate and legitimately
 *   compiles in until the session endpoint exists. Listing it here
 *   would fail every build over a string that is supposed to be there.
 *   When that placeholder is deleted, add them.
 */

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
      'The fixture may only be imported from a module whose use is behind',
      '`import.meta.env.DEV`, so the branch is tree-shaken out of a',
      'production build. See lib/devCounts.ts for the pattern.',
    ].join('\n'),
  )
  process.exit(1)
}

console.log(
  `No fixture data in ${DIST} (checked ${FIXTURE_MARKERS.length} markers).`,
)

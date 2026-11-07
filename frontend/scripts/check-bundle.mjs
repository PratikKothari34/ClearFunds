#!/usr/bin/env node
/*
 * WHAT ACTUALLY SHIPPED.
 *
 * `demogate.test.ts` proves the structural rule the elimination depends on -
 * every credential literal sits inside a `const` gated on `import.meta.env.DEV`
 * and `demo()` bails when that gate is off. It says in its own header that it
 * cannot prove the outcome, because the suite runs BEFORE the build and there
 * is no `dist` to read at that point.
 *
 * Those are two different claims, and the second is the one that matters for a
 * credential-shaped string. The rule holding does not prove the bundler acted
 * on it: a Vite or Rolldown change to how `import.meta.env.DEV` is replaced, a
 * `define` override, a mode other than `production`, or a future refactor that
 * keeps the gate but moves the literal into a template, each leaves the source
 * test green while the strings ride out to every resident's phone. Nothing
 * fails, nothing logs, and the bundle is public the moment it deploys.
 *
 * So this runs AFTER the build, where `budget.mjs` already proved a dist can be
 * read, and asserts the outcome directly: the built assets do not contain the
 * strings.
 *
 * AN EMPTY SEARCH SPACE IS A FAILURE, NOT A PASS - the same rule the budget
 * enforces. A check that silently finds no files to read reports success
 * forever, which is how a dead check keeps looking alive. If `dist` is missing
 * or holds no assets, this fails and says so, rather than congratulating a
 * build that did not happen.
 *
 * It is NOT a secret scanner and must not grow into one. It asserts the
 * absence of values this repo already publishes - `.test` resolves nowhere and
 * the accounts exist only in a local seed - so it leaks nothing by naming
 * them. A real secret must never be written into a check like this: the check
 * is public, so the needle would be too.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = join(import.meta.dirname, '..', 'dist')

/*
 * Each needle is a string that must not appear in a built asset, with the
 * reason it is forbidden. The reason is the point: a bare list gets "fixed" by
 * deleting the row that fails, which is exactly the wrong repair.
 */
const FORBIDDEN = [
  {
    /*
     * A KEY, not the prefix. `@supabase/supabase-js` ships its own key
     * classifier - `e.startsWith('sb_secret_')` is in the vendor chunk by
     * design - so a bare-prefix needle fires on the library that exists to
     * tell the two kinds apart. That is a false denial, and a false denial is
     * the worse failure here: it blocks a correct build and invites deleting
     * the row. Requiring the random tail that follows the prefix is what
     * separates a key from a comparison against one.
     */
    needle: /sb_secret_[A-Za-z0-9_-]{12,}/,
    label: 'sb_secret_… (an actual secret key)',
    why:
      "Supabase's secret key. Only `sb_publishable_...` may reach a browser; the secret key bypasses row-level security.",
  },
  {
    needle: 'clearfunds-demo',
    why:
      "the demo seed account's password. Dev-only by `DEMO_ON`, so a hit means the bundler stopped eliminating the gated branch - the gate is still there and still reads correctly in the source.",
  },
  {
    needle: 'gulmohar.test',
    why:
      'the demo seed domain, same gate and same meaning. Harmless in itself; a credential-shaped string shipped to every resident is the defect.',
  },
  {
    /*
     * The claim INSIDE a JWT payload, not the bare words. A service-role JWT
     * carries `"role":"service_role"`, and matching that shape rather than the
     * identifier alone keeps this from firing on a library that merely names
     * the role - the same false-denial trap as the key prefix above.
     */
    needle: /"role"\s*:\s*"service_role"/,
    label: '"role":"service_role" (a service-role JWT)',
    why:
      'a service-role token bypasses row-level security entirely, so it must never be in a frontend bundle under any flag. The publishable key is the only one that belongs here.',
  },
  {
    needle: 'BEGIN PRIVATE KEY',
    why:
      'PEM private key material. Signing keys are server-held by design and the frontend performs no signing, so any hit here is a key that should not exist in this lane at all.',
  },
]

/** Every built asset, recursively: a nested directory must not escape the scan. */
function assets(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...assets(path))
    else out.push(path)
  }
  return out
}

if (!existsSync(DIST)) {
  process.stderr.write(
    `bundle: FAIL  no dist at ${DIST}.\n` +
      '  This check reads what the build produced, so it must run AFTER `npm run build`.\n' +
      '  Reporting success here would mean a check that passes because it measured nothing.\n',
  )
  process.exit(1)
}

/*
 * Text-ish assets only. A font or an image cannot carry a credential in a form
 * this would catch, and reading them as utf8 produces noise - but the filter is
 * an allow-list of EXTENSIONS, never a count, so adding a new text asset type
 * does not quietly shrink the search space.
 */
const TEXT = /\.(js|mjs|cjs|css|html|json|webmanifest|map|txt|svg)$/i
const all = assets(DIST)
const scanned = all.filter((p) => TEXT.test(p))

if (all.length === 0) {
  process.stderr.write(
    'bundle: FAIL  dist exists but is empty. Nothing was scanned, so nothing was proved.\n',
  )
  process.exit(1)
}

if (scanned.length === 0) {
  process.stderr.write(
    `bundle: FAIL  dist holds ${all.length} file(s) but none matched ${TEXT}.\n` +
      '  The build output was renamed or restructured, so this check has stopped\n' +
      '  measuring. Fix the pattern - do not delete the check.\n',
  )
  process.exit(1)
}

/*
 * The JS entry must be among what was scanned. Without this, a build that
 * emitted only the HTML shell - or a chunking change that moved every script
 * somewhere this does not look - would pass with the application code unread.
 */
if (!scanned.some((p) => /\.(js|mjs)$/i.test(p))) {
  process.stderr.write(
    `bundle: FAIL  no JavaScript among the ${scanned.length} scanned asset(s).\n` +
      '  The credential literals live in JS, so a scan with no JS proves nothing.\n',
  )
  process.exit(1)
}

/*
 * A needle is a plain string or a RegExp. The regexes exist to require the
 * shape of a real value rather than the identifier naming it, so a string
 * needle must stay a substring test - widening it to a regex by accident would
 * make `.` and `-` match more than they read as.
 */
function found(text, needle) {
  return typeof needle === 'string' ? text.includes(needle) : needle.test(text)
}

const hits = []
for (const path of scanned) {
  const text = readFileSync(path, 'utf8')
  for (const row of FORBIDDEN) {
    if (found(text, row.needle)) hits.push({ path, ...row })
  }
}

if (hits.length > 0) {
  for (const { path, needle, label, why } of hits) {
    process.stderr.write(
      `bundle: FAIL  ${label ?? `"${needle}"`} is in ${path.slice(DIST.length + 1)}\n` +
        `  ${why}\n`,
    )
  }
  process.stderr.write(
    '\n  Do not fix this by removing the needle from this check.\n' +
      '  Anything in a built bundle is public the moment it deploys, and stays\n' +
      '  in any copy already fetched.\n',
  )
  process.exit(1)
}

process.stdout.write(
  `bundle: ok    ${FORBIDDEN.length} forbidden strings absent from ${scanned.length} built asset(s).\n`,
)

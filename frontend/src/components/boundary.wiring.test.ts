import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/*
 * That the boundary is WIRED, which is the part the component suite cannot
 * reach.
 *
 * crashed.test.tsx mounts CatchBoundary and Crashed together and proves the
 * card contains a throw. It passes just as happily when nothing in the app
 * uses either one - verified by mutation: deleting `defaultErrorComponent`
 * from the router left all six of its cases green. The card is the reporter;
 * the wiring is the decision, and an unwired boundary is indistinguishable
 * from no boundary at all while looking fully tested.
 *
 * So this reads the source. Two separate placements have to hold, for
 * different reasons, and dropping either one restores the old behaviour on a
 * part of the tree:
 *
 *   - the ROUTER's defaultErrorComponent catches a route's throw inside the
 *     Shell, so the nav survives and one route's content is replaced;
 *   - the ROOT route's own CatchBoundary catches Shell, Login and Splash,
 *     which sit above every route and which the router option cannot see.
 *
 * Asserting on source text is the weaker kind of test and it is deliberate
 * here: the alternative is mounting the whole router, and a suite heavy enough
 * to avoid is a suite that gets deleted. The assertions are anchored so a
 * rename fails rather than silently passing on a comment - the file's own
 * prose names these identifiers, so a bare substring search over the raw text
 * would pass on a file that only TALKS about the boundary. Comments are
 * stripped first, the same trap csp.test.ts documents.
 */

const SRC = join(import.meta.dirname, '..')

/** Strip block and line comments: this file's own prose names every token. */
function code(rel: string): string {
  const raw = readFileSync(join(SRC, rel), 'utf8')
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('the render boundary is wired, not merely written', () => {
  it('the router sets defaultErrorComponent', () => {
    const main = code('main.tsx')
    // Inside the createRouter call, not anywhere in the file: a stray mention
    // elsewhere must not satisfy this.
    const call = main.match(/createRouter\(\{[\s\S]*?\n\}\)/)
    expect(call, 'createRouter({...}) not found in main.tsx').not.toBeNull()
    expect(call![0]).toMatch(/defaultErrorComponent:\s*Crashed\b/)
  })

  it('main.tsx imports the component it names', () => {
    // Guards the half-rename: the option kept, the import gone, which would
    // fail to build rather than fail quietly - but asserting it here means the
    // suite says why.
    expect(code('main.tsx')).toMatch(/import\s*\{\s*Crashed\s*\}\s*from\s*['"]\.\/components\/Crashed['"]/)
  })

  it('the root route wraps its own content in a CatchBoundary', () => {
    const root = code('routes/__root.tsx')
    expect(root).toMatch(/<CatchBoundary[\s\S]*?errorComponent=\{Crashed\}/)
    expect(root).toMatch(/<\/CatchBoundary>/)
    expect(root).toMatch(/import\s*\{[^}]*\bCatchBoundary\b[^}]*\}\s*from\s*['"]@tanstack\/react-router['"]/)
  })

  it('the root boundary sits ABOVE the Shell, not inside it', () => {
    // Placement is the whole point. A boundary inside Shell cannot catch
    // Shell's own throw, which is the case the router option already misses,
    // so the two together would still leave that gap.
    const root = code('routes/__root.tsx')
    const open = root.indexOf('<CatchBoundary')
    const shell = root.indexOf('<Shell>')
    expect(open).toBeGreaterThan(-1)
    expect(shell).toBeGreaterThan(-1)
    expect(open, 'CatchBoundary must open before <Shell>').toBeLessThan(shell)
  })

  it('the reset key changes with the session', () => {
    // A constant key makes reset a no-op forever: the error state would
    // survive a sign-out, so a new person inherits the last one's broken
    // screen. Asserting the key READS the session, not its exact expression.
    const root = code('routes/__root.tsx')
    const key = root.match(/getResetKey=\{([^}]*)\}/)
    expect(key, 'getResetKey not found').not.toBeNull()
    expect(key![1]).toMatch(/session/)
  })
})

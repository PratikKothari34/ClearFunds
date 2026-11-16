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

/*
 * The environment gate, which is the SAME decision class as the boundaries
 * above and fails the same way: the check can be perfectly correct and
 * perfectly unwired, and environment.test.ts would stay green either way,
 * because it tests the function and this tests whether anything calls it.
 *
 * It is here rather than in its own file because the failure it guards is the
 * one the boundaries could not catch. Production served a blank page: the
 * Supabase pair was unset, AuthProvider's effect made the first property read
 * on the lazy client, and that throw was above BOTH boundaries, so React
 * unmounted everything. The fix only works if the gate is evaluated before
 * AuthProvider mounts - which is an ORDERING property of main.tsx, invisible
 * to any test that imports the gate directly.
 */
describe('the environment gate is wired above the provider that throws', () => {
  it('main.tsx calls environmentFault and imports it', () => {
    const main = code('main.tsx')
    expect(main).toMatch(/\benvironmentFault\s*\(/)
    expect(main).toMatch(/import\s*\{\s*environmentFault\s*\}\s*from\s*['"]\.\/lib\/environment['"]/)
  })

  it('main.tsx renders Misconfigured, and imports it', () => {
    // The gate returning a fault that nothing renders is a blank page with
    // extra steps.
    const main = code('main.tsx')
    expect(main).toMatch(/<Misconfigured\b/)
    expect(main).toMatch(/import\s*\{\s*Misconfigured\s*\}\s*from\s*['"]\.\/components\/Misconfigured['"]/)
  })

  it('the gate is evaluated BEFORE AuthProvider is mounted', () => {
    /*
     * The ordering IS the fix. AuthProvider's mount effect is what touches the
     * lazy client, so a gate evaluated after it has already mounted catches
     * nothing - the throw happens first and takes the tree down exactly as
     * before, with the gate sitting there looking correct.
     */
    const main = code('main.tsx')
    const gate = main.search(/\bconst\s+fault\s*=\s*environmentFault\s*\(/)
    const provider = main.indexOf('<AuthProvider>')
    expect(gate, 'the environmentFault() call was not found').toBeGreaterThan(-1)
    expect(provider, '<AuthProvider> was not found').toBeGreaterThan(-1)
    expect(gate, 'environmentFault() must be evaluated before <AuthProvider>').toBeLessThan(provider)
  })

  it('a fault renders INSTEAD of the app, not beside it', () => {
    /*
     * Rendering the message above a live tree would still mount AuthProvider,
     * which still throws, which still blanks the page - the message would be
     * drawn and then unmounted with everything else. The provider must be in
     * the branch NOT taken when there is a fault.
     *
     * Asserted structurally: Misconfigured and AuthProvider must sit in
     * opposite arms of one conditional, so the provider cannot be reached
     * while a fault exists.
     */
    const main = code('main.tsx')
    const branch = main.match(/\{\s*fault\s*\?[\s\S]*?\)\s*\}/)
    expect(branch, 'no `fault ? ... : ...` branch found in the render').not.toBeNull()
    const [consequent, alternative] = branch![0].split(/:\s*\(/)
    expect(consequent, 'Misconfigured must be the fault arm').toMatch(/<Misconfigured\b/)
    expect(consequent, 'the app must NOT mount in the fault arm').not.toMatch(/<AuthProvider\b/)
    expect(alternative, 'the app must mount in the no-fault arm').toMatch(/<AuthProvider\b/)
  })

  it('the gate reads both variables, so half an environment still faults', () => {
    /*
     * A gate that checks only the url passes a build that has the url and no
     * key - and that build blanks identically. The pair is checked in
     * environment.ts rather than here, but the module must actually name both,
     * or the deployment case that bit us is only half covered.
     */
    const env = code('lib/environment.ts')
    expect(env).toContain('VITE_SUPABASE_URL')
    expect(env).toContain('VITE_SUPABASE_PUBLISHABLE_KEY')
  })
})

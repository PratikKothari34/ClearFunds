import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NOT_CONNECTED, NOT_CONNECTED_EXPLANATION } from './pending'

/*
 * A BUTTON THAT DOES NOTHING MUST SAY SO, and this is the guard on
 * that rule rather than on the wording.
 *
 * Four controls in this product are inert because the server lane is
 * not built: approve an expense, download a report, sign off a month,
 * send a sign-in code. Pressing any of them silently changes nothing.
 * On the approve control that is the exact ambiguity the product
 * exists to remove - a treasurer cannot tell whether the approval
 * landed, the page broke, or the phone dropped it.
 *
 * The checks here are deliberately structural: they read the source
 * and assert that no route or component declares a bare interactive
 * <button> that is neither wired nor marked. A test that only asserted
 * the sentence would stay green the moment someone added a fifth
 * unwired button.
 */

const COMPONENTS = resolve('src/components')
const ROUTES = resolve('src/routes')

function sources(dir: string): readonly { readonly name: string; readonly code: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
    .map((name) => ({
      name,
      // Comments are stripped: several of these files EXPLAIN in a
      // comment why a control is inert, and a search that counted the
      // explanation would be satisfied by a file that only talks
      // about the rule. The OFL test in styles/ was caught by exactly
      // this and carries the same note.
      code: readFileSync(resolve(dir, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\/[^\n]*/g, ''),
    }))
}

describe('the not-connected notice', () => {
  it('states what has not happened, not only that the button is off', () => {
    // The fear on a money screen is never "the button is broken", it
    // is "did I just do something". The second half is the part that
    // answers it, so a reword that drops it fails here.
    expect(NOT_CONNECTED_EXPLANATION).toMatch(/nothing has been recorded/i)
    expect(NOT_CONNECTED_EXPLANATION).toMatch(/not connected/i)
    // Never a promise about when.
    expect(NOT_CONNECTED_EXPLANATION).not.toMatch(
      /soon|shortly|coming|next (week|month|release)/i,
    )
  })

  it('is short enough to sit in a button name', () => {
    expect(NOT_CONNECTED.length).toBeLessThan(28)
    expect(NOT_CONNECTED).not.toContain('.')
  })
})

describe('every inert control is marked, not silently dead', () => {
  it('uses aria-disabled rather than disabled, so it stays findable', () => {
    /*
     * `disabled` removes a control from the tab order and from a
     * screen reader's control list, so a keyboard user reads a page
     * about approving an expense with no approve control anywhere -
     * a worse lie than an unfinished one.
     */
    const code = readFileSync(resolve(COMPONENTS, 'PendingAction.tsx'), 'utf8')
    expect(code).toContain('aria-disabled')
    expect(code).not.toMatch(/\sdisabled(=|\s|\/|>)/)
  })

  it('declares no bare <button> outside the ones that are wired or marked', () => {
    /*
     * THE RULE, NOT THE COUNT. A literal "there are exactly four" would
     * be edited to five by whoever adds the fifth, which deletes the
     * test's meaning while leaving it green.
     *
     * A <button> in a route or component is acceptable only if the
     * file also attaches a handler (onClick/onChange/onSubmit) or
     * marks the control aria-disabled. PendingAction is the marker
     * itself, so it is where aria-disabled lives.
     */
    const offenders: string[] = []
    for (const dir of [COMPONENTS, ROUTES]) {
      for (const { name, code } of sources(dir)) {
        if (!/<button\b/.test(code)) continue
        const wired = /on(Click|Change|Submit|Input|KeyDown)=/.test(code)
        const marked = /aria-disabled/.test(code)
        if (!wired && !marked) offenders.push(`${name}`)
      }
    }
    expect(
      offenders,
      `these files render a <button> that is neither wired nor marked not-connected: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('routes with an inert control render the shared component', () => {
    /*
     * Derived from the source, not a hardcoded list: any route that
     * uses PendingAction must import it from one place, so the
     * sentence cannot be retyped per page. Four slightly different
     * explanations of one state read as four different faults.
     */
    const users: string[] = []
    for (const dir of [COMPONENTS, ROUTES]) {
      for (const { name, code } of sources(dir)) {
        if (name === 'PendingAction.tsx') continue
        if (!/<PendingAction\b/.test(code)) continue
        users.push(name)
        expect(code, `${name} uses PendingAction without importing it`).toMatch(
          /import \{ PendingAction \} from/,
        )
        // And it must not hand-roll the sentence beside it.
        expect(
          code,
          `${name} spells the not-connected notice out instead of letting the component say it`,
        ).not.toContain(NOT_CONNECTED_EXPLANATION)
      }
    }
    // Control: if the component stops being used anywhere, the two
    // assertions above pass vacuously. The product has inert controls
    // today, so at least one file must use it.
    expect(users.length).toBeGreaterThan(0)
  })
})

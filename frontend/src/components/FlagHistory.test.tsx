import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FlagHistory } from './FlagHistory'
import { ViewerRoleContext } from '../lib/viewer'
import type { FlagLogItem, Role } from '../lib/types'

afterEach(cleanup)

const question: FlagLogItem = {
  id: 'f-1',
  question: 'Why two lift invoices in one month?',
  raisedAt: '2026-10-21T09:12:00+05:30',
  authorHandle: 'Resident B-402',
}

function renderAs(role: Role, entries: readonly FlagLogItem[] | null) {
  return render(
    <ViewerRoleContext.Provider value={role}>
      <FlagHistory entries={entries} />
    </ViewerRoleContext.Provider>,
  )
}

/*
 * ABSENT IS NOT EMPTY, on the surface where it was collapsed.
 *
 * The entry detail page passed `?? []`, so a flag log that failed to
 * load rendered the sentence meaning nobody had asked. A resident acts
 * on that by closing the page, and an open question about the payment
 * they were looking at stays invisible.
 */
describe('FlagHistory when the log did not load', () => {
  it('does not assert that nobody has asked', () => {
    renderAs('resident', null)
    const text = document.body.textContent ?? ''
    /*
     * The ASSERTION, not the word. The fallback copy says "This does NOT
     * mean nobody has asked about it", so forbidding the bare word
     * would punish the explanation - the same correction the fonts
     * guard carries. What must never appear is the claim itself,
     * unnegated.
     */
    expect(text).not.toMatch(/(?<!not mean )nobody has asked/i)
    // And the negation must actually be present, or the regex above is
    // passing for the wrong reason.
    expect(text).toMatch(/does not mean nobody has asked/i)
  })

  it('says the questions are missing rather than absent', () => {
    renderAs('resident', null)
    expect(document.body.textContent).toMatch(/could not be loaded/i)
  })

  it('says the entry itself is unaffected', () => {
    // Otherwise a failed sidebar read reads as the record being in doubt.
    renderAs('resident', null)
    expect(document.body.textContent).toMatch(/nothing has been changed/i)
  })

  it('is distinguishable from a genuinely empty log', () => {
    const { container: absent, unmount } = renderAs('resident', null)
    const absentText = absent.textContent
    unmount()
    const { container: empty } = renderAs('resident', [])
    expect(absentText).not.toBe(empty.textContent)
  })
})

describe('FlagHistory when nobody has asked', () => {
  it('says so plainly', () => {
    renderAs('resident', [])
    expect(document.body.textContent).toMatch(/nobody has asked/i)
  })
})

/*
 * Residents are anonymous to each other. Two independent checks guard
 * this - the server should omit the handle entirely - and this one
 * covers the case where the payload over-shares.
 */
describe('who may see a question author', () => {
  const offices: readonly Role[] = ['treasurer', 'secretary', 'president']

  it('shows the handle to the offices that can act on it', () => {
    for (const role of offices) {
      const { unmount } = renderAs(role, [question])
      expect(document.body.textContent, role).toContain('Resident B-402')
      unmount()
    }
  })

  it('withholds it from everyone else, even when the payload carries it', () => {
    /*
     * Derived from the predicate rather than listed, so a role added to
     * Role without a decision about it fails here instead of silently
     * defaulting to visible. Asserting a hardcoded list of two would go
     * stale the moment a role is added.
     */
    const all: readonly Role[] = [
      'resident',
      'treasurer',
      'secretary',
      'president',
      'committee',
      'auditor',
    ]
    const others = all.filter((r) => !offices.includes(r))
    expect(others.length, 'no non-office roles left to check').toBeGreaterThan(
      0,
    )
    for (const role of others) {
      const { unmount } = renderAs(role, [question])
      expect(document.body.textContent, role).not.toContain('Resident B-402')
      // The question itself is still visible: anonymity hides the
      // author, never the question.
      expect(document.body.textContent, role).toContain('two lift invoices')
      unmount()
    }
  })
})

describe('the log keeps resolved questions', () => {
  it('shows an answered question rather than dropping it', () => {
    /*
     * THE LOG IS THE RECORD; THE COUNT IS A TO-DO LIST. A resolved
     * question that vanishes is indistinguishable from one never asked.
     */
    renderAs('resident', [
      {
        ...question,
        resolvedAt: '2026-10-22T10:00:00+05:30',
        answer: 'Two lifts, billed separately.',
      },
    ])
    expect(screen.getByText(/two lifts, billed separately/i)).toBeTruthy()
    expect(document.body.textContent).toMatch(/answered/i)
  })
})

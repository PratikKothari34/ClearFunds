import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { canSeeFlagAuthor } from './identity'
import { ViewerRoleContext, useViewerRole } from './viewer'

/*
 * The context DEFAULT is a security decision, so it is asserted rather
 * than left to a comment.
 *
 * A component rendered outside the provider - in a test, or in a route
 * someone mounts bare later - reads the default. If that default were
 * an office-holder, forgetting the provider would reveal who raised
 * every question, and the failure mode of an omission would be a
 * privacy leak rather than a blank space.
 */

function Probe() {
  const role = useViewerRole()
  return <span data-testid="role">{role}</span>
}

describe('ViewerRoleContext', () => {
  it('defaults to the least privileged role', () => {
    const { getByTestId } = render(<Probe />)
    expect(getByTestId('role').textContent).toBe('resident')
  })

  it('defaults to a role that cannot see who asked', () => {
    /*
     * The assertion that matters, stated as the RULE rather than as the
     * string 'resident'. If the default is ever changed to any role
     * that passes `canSeeFlagAuthor`, this fails - which is the point.
     * Checking the literal alone would let 'president' through as long
     * as someone updated the expected string to match.
     */
    const { getByTestId } = render(<Probe />)
    const fallback = getByTestId('role').textContent
    expect(fallback).toBeTruthy()
    expect(canSeeFlagAuthor(fallback as never)).toBe(false)
  })

  it('reads the provider value when one is present', () => {
    const { getByTestId } = render(
      <ViewerRoleContext.Provider value="treasurer">
        <Probe />
      </ViewerRoleContext.Provider>,
    )
    expect(getByTestId('role').textContent).toBe('treasurer')
  })

  it('does not leak a provider value to a sibling outside it', () => {
    /*
     * Two surfaces render a handle and both read this context. A value
     * escaping its provider's subtree would show one screen's viewer
     * role on another's.
     */
    const { getByTestId } = render(
      <>
        <ViewerRoleContext.Provider value="president">
          <span />
        </ViewerRoleContext.Provider>
        <Probe />
      </>,
    )
    expect(getByTestId('role').textContent).toBe('resident')
  })
})

import '@testing-library/jest-dom/vitest'

/*
 * React 19 looks for this flag to decide whether the environment can
 * support `act(...)`. Without it every state update inside a test logs
 * "The current testing environment is not configured to support
 * act(...)" to stderr while still passing.
 *
 * It is set here because a suite that prints warnings on a green run
 * trains everyone to ignore its stderr, and the next warning is the one
 * that matters.
 */
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { createContext, useContext } from 'react'
import type { Role } from './types'

/**
 * The signed-in viewer's role, for the surfaces that must branch on it.
 *
 * This is the only React context in the app and it exists for one
 * reason: two surfaces render who asked a question — the disputes list
 * and an entry's flag history — and both must hide that from other
 * residents. Threading a role down to them as a prop means every
 * intermediate component carries a prop it does not use, and the one
 * call site that forgets it is the one that leaks.
 *
 * It is NOT a store and must not become one. Nothing writes to it
 * except the root layout, and nothing else belongs in it: a context
 * that accumulates fields is a global store with extra steps, and the
 * stack decision rules one out.
 *
 * The default is `resident`, deliberately the LEAST privileged role. A
 * component rendered outside the provider — in a test, or in a route
 * that someone mounts bare later — then hides identities rather than
 * showing them. A default of treasurer would make the leak the failure
 * mode of forgetting the provider.
 */
export const ViewerRoleContext = createContext<Role>('resident')

export function useViewerRole(): Role {
  return useContext(ViewerRoleContext)
}

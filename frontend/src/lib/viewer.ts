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

/**
 * The flat the signed-in resident occupies, or `undefined`.
 *
 * A SECOND context, not a second field on the first one, and the
 * reason is the warning above: a context that accumulates fields
 * becomes a global store with extra steps. These two are deliberately
 * separate values with separate defaults, so neither can be widened by
 * someone adding "just one more" field to a viewer object.
 *
 * It exists because `/my-flat` decides WHOSE dues and WHOSE questions
 * to render, and it was deciding that from a module constant. A role
 * cannot answer that question - two residents share a role and do not
 * share a flat.
 *
 * The default is `undefined`, which is the least-privileged answer for
 * the same reason `resident` is: a component rendered outside the
 * provider renders the "no flat is linked" state rather than some
 * resident's arrears. An absent flat is also the honest value for
 * every non-resident role, because an auditor has no flat at all -
 * which is why the type is optional rather than a sentinel string.
 */
export const ViewerFlatContext = createContext<string | undefined>(undefined)

export function useViewerFlat(): string | undefined {
  return useContext(ViewerFlatContext)
}

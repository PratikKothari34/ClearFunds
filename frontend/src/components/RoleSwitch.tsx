import type { Role } from '../lib/types'

/**
 * A development-only control for viewing the app as each role.
 *
 * WHY THIS IS GATED, AND WHY THE GATE IS A BUILD-TIME CONSTANT.
 *
 * A shipped control that changes the viewer's role would be
 * indefensible in a product whose entire claim is that no single person
 * moves the ledger alone. `import.meta.env.DEV` is replaced by a
 * literal at build time and the dead branch is removed, so this
 * component is not merely hidden in production — it is absent from the
 * bundle, along with every string in it. A runtime flag, a URL
 * parameter or a localStorage key would all leave the code shipped and
 * reachable.
 *
 * Role here is still cosmetic, exactly as nav.ts says: it decides what
 * is worth showing, never what is permitted. The server refuses
 * surfaces to direct requests regardless of what this control says, and
 * when the session endpoint lands this component and the placeholder
 * viewer are deleted together.
 */

const ROLES: readonly Role[] = [
  'resident',
  'treasurer',
  'secretary',
  'president',
  'committee',
  'auditor',
]

export function RoleSwitch({
  role,
  onChange,
}: {
  readonly role: Role
  readonly onChange: (role: Role) => void
}) {
  if (!import.meta.env.DEV) return null

  return (
    <label className="flex items-center gap-(--cf-s1) text-meta text-ink-quiet">
      {/*
        Labelled "view as" rather than "role": it describes what the
        control does to the screen, not a property of the person. A
        developer reading "role: resident" can mistake it for the
        session actually being a resident's.
      */}
      <span>View as</span>
      <select
        value={role}
        onChange={(e) => onChange(e.target.value as Role)}
        className="border border-rule bg-surface px-(--cf-s1) py-0.5 text-meta text-ink"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </label>
  )
}

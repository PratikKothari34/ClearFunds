/*
 * THE BOUNDARY. Nothing from the wire reaches a surface without passing
 * through here.
 *
 * api.ts crossed the wire thirteen times with `as unknown as T`. A cast
 * checks nothing at runtime, so the compiler vouched for a shape that no code
 * enforced, across every hook. types.ts says at the top of the file that
 * views report every column as nullable and that its own declarations "state
 * what the view actually guarantees" - a guarantee nothing ever checked.
 *
 * That gap is not hypothetical. flat_dues amounts really do arrive nullable,
 * types.ts really did declare them `number`, and `null <= 0` being true meant
 * a flat that owed money read as settled and dropped out of the treasurer's
 * list. See countable.ts. The remaining hooks have the same hole and no known
 * bad value yet, which is not the same thing as being safe.
 *
 * WHY HAND-WRITTEN AND NOT ZOD. zod sits in node_modules at 7.7 MB, but only
 * as a transitive dependency of @tanstack/router-plugin, which is a
 * devDependency - build-time, never shipped. Promoting it to a runtime
 * dependency puts a parser on the resident read path against a standing
 * bundle budget, and importing it where it sits today means depending on
 * something an unrelated upgrade can remove. The shapes here are few, known,
 * and specified in contracts/api/v1.md.
 *
 * WHAT A FAILURE MEANS. A response that does not match its declared shape is
 * a failed query, surfaced through the existing Failed component. It is never
 * a half-trusted object handed to a component, because a surface cannot tell
 * a field it was given from one it was not. A visible error beats a plausible
 * wrong number - that is the same rule money.ts follows when it throws rather
 * than coercing.
 *
 * THIS IS NOT countable.ts. That answers "may a surface decide from this
 * figure", and lets a screen disclose an amount it could not read. This
 * answers "is this the declared shape at all". A row can pass here and still
 * carry an amount countable.ts refuses - a nullable column that really is
 * null is a valid row with an unreadable figure.
 */

/** Where a failure was found, so a message can name it. */
export class ShapeError extends Error {
  readonly path: string
  readonly detail: string
  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`)
    this.name = 'ShapeError'
    this.path = path
    this.detail = detail
  }
}

export type Parser<T> = (value: unknown, path: string) => T

/*
 * Primitives. Each states what it rejects, because the rejections are the
 * whole value of the module.
 */

/** A finite, exact integer. Rejects null, NaN, Infinity, floats and strings. */
export const int: Parser<number> = (v, p) => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) {
    throw new ShapeError(p, `expected a safe integer, got ${describe(v)}`)
  }
  return v
}

export const str: Parser<string> = (v, p) => {
  if (typeof v !== 'string') throw new ShapeError(p, `expected a string, got ${describe(v)}`)
  return v
}

export const bool: Parser<boolean> = (v, p) => {
  if (typeof v !== 'boolean') throw new ShapeError(p, `expected a boolean, got ${describe(v)}`)
  return v
}

/*
 * A nullable column. `null` passes through as null - it is a legitimate
 * value, not a failure - but anything else must still match. This is the
 * parser most of database.types.ts needs, and using it is an assertion that
 * the surface downstream handles null.
 */
export function nullable<T>(inner: Parser<T>): Parser<T | null> {
  /*
   * An EXPLICIT null passes; an absent field does not. Folding undefined in
   * here made a response that dropped a column indistinguishable from one
   * that reported no value, and those are different claims - the first is a
   * broken response, the second is data. It also meant a typo in a select
   * list produced a screenful of honest-looking nulls, which is how this
   * whole class of bug stays invisible.
   */
  return (v, p) => {
    if (v === undefined) throw new ShapeError(p, 'the field is absent; a null must be sent explicitly')
    return v === null ? null : inner(v, p)
  }
}

/*
 * A column the view types nullable and the read model guarantees is present.
 * Distinct from `int` so the intent is readable at the call site: this one
 * says "the contract promises a number here", and a null is a contract
 * violation worth surfacing rather than a value to absorb.
 */
export function required<T>(inner: Parser<T>): Parser<T> {
  return (v, p) => {
    if (v === null || v === undefined) {
      throw new ShapeError(p, 'the contract says this is never null, but it was')
    }
    return inner(v, p)
  }
}

/** One of a fixed set. The server choosing the value is exactly why this is checked. */
export function oneOf<const T extends readonly string[]>(options: T): Parser<T[number]> {
  return (v, p) => {
    const s = str(v, p)
    if (!options.includes(s)) {
      throw new ShapeError(p, `expected one of ${options.join(', ')}, got ${JSON.stringify(s)}`)
    }
    return s as T[number]
  }
}

export function array<T>(inner: Parser<T>): Parser<T[]> {
  return (v, p) => {
    if (!Array.isArray(v)) throw new ShapeError(p, `expected an array, got ${describe(v)}`)
    return v.map((item, i) => inner(item, `${p}[${i}]`))
  }
}

/*
 * An object with declared fields. Unknown fields are KEPT, not stripped: the
 * backend adding a column must not break a deployed frontend, and nothing
 * here decides from a field it does not know about.
 */
export function object<T extends Record<string, unknown>>(
  fields: { [K in keyof T]: Parser<T[K]> },
): Parser<T> {
  return (v, p) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new ShapeError(p, `expected an object, got ${describe(v)}`)
    }
    const row = v as Record<string, unknown>
    const out = { ...row } as T
    for (const key of Object.keys(fields) as (keyof T)[]) {
      out[key] = fields[key](row[key as string], p ? `${p}.${String(key)}` : String(key))
    }
    return out
  }
}

/** Entry point: parse a whole response, naming the hook for the message. */
export function parse<T>(parser: Parser<T>, value: unknown, what: string): T {
  return parser(value, what)
}

/*
 * Named so a message says "got null" rather than "got object", which is the
 * difference between a readable failure and a puzzle. Values are described,
 * never printed in full: a row can carry a resident's name or handle and an
 * error message can end up in a log or a screenshot.
 */
function describe(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : Number.isFinite(v) ? `the number ${v}` : String(v)
  if (Array.isArray(v)) return `an array of ${v.length}`
  return `a ${typeof v}`
}

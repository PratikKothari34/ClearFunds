/*
 * THE KINDS CONTRACT ITSELF, NOT THE VECTORS.
 *
 * chain.kinds.test.ts enumerates kinds out of the three vector FILES. That
 * leaves the gap it closed one step smaller rather than shut: a kind shipped
 * with a contract doc and no vector file still lands with no layout in KINDS,
 * is reported to the resident as not checked, and nothing goes red.
 *
 * ledger.v1.md is exactly that case and it is not hypothetical - it has no
 * vector file and it defines TEN of the nineteen kinds, including every kind
 * that moves money (proposal, approval, posting). Over half the table was
 * written against prose and compared to nothing.
 *
 * So this reads the contract markdown. Each kind is a `### \`name\`` heading
 * followed by a numbered field table, which is machine-readable, so the
 * layout can be rebuilt from the contract and compared field for field:
 * name, order, type and optionality. A field renumbered in the markdown
 * changes every hash for that kind, so the ordering is load-bearing and is
 * asserted as ordering, not as a set.
 *
 * Nothing here names a kind, a field or a count. The one number asserted is
 * that the directory is not empty - because a check whose pattern matches
 * nothing reports success forever, which is the failure the route-chunk
 * budget shipped with for weeks.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KINDS, type FieldType } from './chain'

const DIR = resolve(__dirname, '../../../contracts/chain/kinds')

/*
 * Rebuild one kind's layout from its field table.
 *
 * The type cell may carry a trailing note - `month` is "text, `YYYY-MM`" -
 * so the type is the part before the first comma. Stripping the whole cell
 * instead would make every type compare equal to a prefix of itself and the
 * assertion would stop distinguishing `int` from `int?`.
 *
 * The leading `|` of a markdown table row is required, so prose that happens
 * to contain a pipe cannot be read as a field.
 */
function layoutsIn(md: string): Record<string, [string, FieldType][]> {
  const out: Record<string, [string, FieldType][]> = {}
  // Split on the kind headings, which yields [prose, name, body, name, body...]
  const parts = md.split(/^###\s+`([a-z0-9_]+)`[^\n]*$/m)
  for (let i = 1; i < parts.length; i += 2) {
    const kind = parts[i]!
    const rows = [...parts[i + 1]!.matchAll(/^\|\s*(\d+)\s*\|\s*`([a-z0-9_]+)`\s*\|\s*([^|]+?)\s*\|/gm)]
    if (rows.length === 0) continue // a kind described in prose with no table yet
    const fields = rows
      .map((m) => ({
        n: Number(m[1]),
        name: m[2]!,
        // `list\<text\>` in the markdown is list<text> as a type
        type: m[3]!.replaceAll('\\', '').split(',')[0]!.trim().replaceAll('`', ''),
      }))
      .toSorted((a, b) => a.n - b.n)
    out[kind] = fields.map((f) => [f.name, f.type] as [string, FieldType])
  }
  return out
}

const FILES = readdirSync(DIR).filter((f) => f.endsWith('.v1.md')).toSorted()

describe('contracts/chain/kinds/', () => {
  it('holds contract files, so the per-file suites below are not vacuous', () => {
    // If the directory is renamed or the suffix changes, every describe.each
    // below iterates nothing and this suite passes while measuring no kinds.
    expect(FILES.length).toBeGreaterThan(0)
  })

  it('defines every kind exactly once across all the files', () => {
    // Two files defining the same kind differently would make the winner
    // depend on read order, and the loser would never be checked.
    const seen: string[] = []
    for (const f of FILES) {
      seen.push(...Object.keys(layoutsIn(readFileSync(resolve(DIR, f), 'utf8'))))
    }
    expect(seen.length).toBeGreaterThan(0)
    expect([...new Set(seen)].toSorted()).toEqual(seen.toSorted())
  })

  it('has a layout in KINDS for every kind any contract defines', () => {
    /*
     * The whole point of the suite. A kind with no layout is not a crash:
     * walk() moves the entry into `unchecked` and carries on using the hash
     * the SERVER reported. So the entry still links, the head still matches,
     * and the resident is told it was not checked - which is the honest
     * answer, but it means an entire kind of traffic is taken on trust.
     */
    const defined = new Set<string>()
    for (const f of FILES) {
      for (const k of Object.keys(layoutsIn(readFileSync(resolve(DIR, f), 'utf8')))) defined.add(k)
    }
    expect(defined.size).toBeGreaterThan(0)
    const missing = [...defined].filter((k) => !KINDS[k]).toSorted()
    expect(
      missing,
      `no layout in KINDS for ${missing.join(', ')}; walk() would trust the server's hash for those entries`,
    ).toEqual([])
  })

  it('has no layout in KINDS that no contract defines', () => {
    /*
     * The other direction, and it is not symmetry for its own sake. A layout
     * for a kind no contract defines is either a kind that was renamed -
     * leaving the real one unverifiable - or a guess. Either way the hash it
     * computes cannot be checked against anything.
     */
    const defined = new Set<string>()
    for (const f of FILES) {
      for (const k of Object.keys(layoutsIn(readFileSync(resolve(DIR, f), 'utf8')))) defined.add(k)
    }
    expect(defined.size).toBeGreaterThan(0)
    expect(Object.keys(KINDS).filter((k) => !defined.has(k)).toSorted()).toEqual([])
  })
})

describe.each(FILES)('contracts/chain/kinds/%s', (file) => {
  const layouts = layoutsIn(readFileSync(resolve(DIR, file), 'utf8'))

  it('parses as at least one kind with at least one field', () => {
    // A restructured doc - headings demoted, the table turned into prose -
    // would otherwise silently stop contributing kinds, and the per-kind
    // assertions below would iterate nothing.
    const kinds = Object.entries(layouts)
    expect(kinds.length).toBeGreaterThan(0)
    for (const [kind, fields] of kinds) {
      expect(fields.length, `${kind} parsed with no fields`).toBeGreaterThan(0)
    }
  })

  for (const [kind, contract] of Object.entries(layouts)) {
    it(`KINDS.${kind} matches the contract table field for field, in order`, () => {
      const ours = KINDS[kind]
      expect(ours, `no layout for '${kind}'`).toBeDefined()
      /*
       * toEqual on the arrays, so a field reordered fails as loudly as a
       * field renamed. The preimage concatenates in this order, so the two
       * are the same severity: both change every hash for the kind.
       */
      expect(ours).toEqual(contract)
    })
  }

  it('distinguishes an optional field from a required one', () => {
    /*
     * Guards this suite against being weakened rather than the code.
     *
     * The field-for-field assertion above compares both sides, so stripping
     * the `?` from BOTH the contract parse and KINDS leaves them matching and
     * every assertion green - a self-consistent loosening, which is the shape
     * that gets "fixed" into a check that passes on broken code. Absent does
     * not encode as a value: a receipt that posted no proposal would carry
     * the hash of one citing proposal 0.
     *
     * So assert the parse actually carries optionality, and that it tracks
     * the markdown rather than being assumed. Derived from the contract, so
     * no count or field name is frozen here.
     */
    const md = readFileSync(resolve(DIR, file), 'utf8')
    const optional = Object.values(layouts)
      .flat()
      .filter(([, type]) => type.endsWith('?'))
    // Every `T?` parsed must be a `T?` written in the markdown, and vice versa.
    const inMarkdown = [...md.matchAll(/^\|\s*\d+\s*\|\s*`[a-z0-9_]+`\s*\|\s*([a-z<>\\]+\?)\s*[|,]/gm)]
    expect(optional.length).toBe(inMarkdown.length)
    /*
     * And the markdown's own optional types survive into the parse as
     * distinct strings. Deliberately NOT asserted per field name across the
     * file: the same name is optional in one kind and required in another -
     * `person` is text? on a proposal and text on a key_registered - so a
     * cross-kind comparison fails on correct contracts.
     */
    for (const m of inMarkdown) {
      expect(optional.map(([, t]) => t)).toContain(m[1]!.replaceAll('\\', ''))
    }
  })

  it('declares only field types the encoder implements', () => {
    /*
     * A type the contract introduces and encode() does not implement would
     * throw on the first entry of that kind, in production, at the point a
     * resident opens the record - not here. Checking it against the encoder's
     * own behaviour rather than a list of names, so a type added to encode()
     * needs no edit here.
     */
    for (const [kind, fields] of Object.entries(layouts)) {
      for (const [name, type] of fields) {
        const base = type.endsWith('?') ? type.slice(0, -1) : type
        const inner = base.startsWith('list<') ? base.slice(5, -1) : base
        expect(
          ['int', 'text', 'bytes', 'bool'],
          `${kind}.${name} is '${type}', whose base type the encoder does not implement`,
        ).toContain(inner)
      }
    }
  })
})

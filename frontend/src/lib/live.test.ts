/**
 * `LIVE_KEYS` decides which cached reads a chain insert refreshes, and it is a
 * hand-written list sitting far away from the `useQuery` calls it is supposed
 * to cover. It has drifted twice: two names that were never query keys at all,
 * and two keys that existed and were missing - 'tenant-flags', then 'me'.
 *
 * Nothing failed either time. A missing key is a screen that quietly shows
 * yesterday's answer; a surplus name is an invalidation that does nothing. So
 * this derives the real set of query keys FROM THE SOURCE and asserts the list
 * against it, which is the only shape that catches the next one.
 *
 * It reads source text rather than mounting anything on purpose. The decision
 * here is "is this key in the list", and a render test would only speak for
 * the screen it mounted - the keys live in eleven different files.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIVE_KEYS_FOR_TEST, NOT_LIVE } from './api'

const SRC = resolve(__dirname, '..')

/** Every .ts/.tsx file under src/, tests excluded. */
function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      out.push(...sources(p))
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

/*
 * Comments are stripped before matching. Every exclusion is NAMED in a comment
 * in `api.ts`, so a comment-blind scan would find each one as a live key and
 * the suite would contradict itself.
 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const FILES = sources(SRC)

/** The root string of every `queryKey: ['root', ...]` in the source. */
function queryKeyRoots(): Set<string> {
  const roots = new Set<string>()
  for (const f of FILES) {
    const text = strip(readFileSync(f, 'utf8'))
    for (const m of text.matchAll(/queryKey:\s*\[\s*'([a-z-]+)'/g)) roots.add(m[1]!)
  }
  return roots
}

describe('the realtime invalidation list', () => {
  it('finds the query keys at all', () => {
    /*
     * A floor, not an exact count: adding a screen must not "fix" this test by
     * editing a number. If the pattern ever stops matching - the keys move to
     * a constant, `useQuery` is wrapped - this fails instead of reporting that
     * zero keys need invalidating, which would pass every assertion below.
     */
    expect(FILES.length, 'no source files found: the scan is looking in the wrong place')
      .toBeGreaterThan(20)
    expect(queryKeyRoots().size, 'no queryKey roots found: the pattern has stopped matching')
      .toBeGreaterThan(10)
  })

  it('accounts for every query key in the source, as live or deliberately not', () => {
    /*
     * THE DEFECT, twice over. A new `useQuery` whose key nobody adds to
     * LIVE_KEYS leaves that screen stale after someone else posts an entry,
     * and nothing anywhere fails. Forcing every key into one of the two lists
     * means the next one cannot be merely forgotten - it has to be decided.
     */
    const unaccounted = [...queryKeyRoots()]
      .filter((k) => !LIVE_KEYS_FOR_TEST.includes(k as never))
      .filter((k) => !NOT_LIVE.includes(k as never))
      .sort()
    expect(
      unaccounted,
      'these query keys are in neither LIVE_KEYS nor NOT_LIVE: a chain insert will not refresh them and nobody has said that is intended',
    ).toEqual([])
  })

  it('invalidates nothing that is not a real query key', () => {
    /*
     * The other direction, and the reason it matters: 'head' and 'structuring'
     * sat in this list and were never keys, so the list LOOKED like it covered
     * them. A surplus name is a silent no-op that reads as coverage.
     */
    const roots = queryKeyRoots()
    const phantom = [...LIVE_KEYS_FOR_TEST].filter((k) => !roots.has(k)).sort()
    expect(phantom, 'these are invalidated but are not query keys anywhere: the call does nothing')
      .toEqual([])
  })

  it('does not claim an exclusion for a key that no longer exists', () => {
    const roots = queryKeyRoots()
    const stale = [...NOT_LIVE].filter((k) => !roots.has(k)).sort()
    expect(stale, 'NOT_LIVE names keys that are gone: the reasoning is stale').toEqual([])
  })

  it("refreshes the viewer's own seat, because seating is a chain entry", () => {
    /*
     * Pinned separately from the completeness check above, because this one has
     * a consequence worth naming rather than a rule: `seat_admin`,
     * `unseat_admin` and `appoint_auditor` are all chain entries, and `me`
     * carries the seat that `nav.ts`, `pending.ts` and every `isCommittee`
     * gate read. `useMe` holds it for 60s, or for as long as the tab is
     * mounted. Dropping 'me' from the list puts a treasurer in front of a
     * screen with no approval controls.
     *
     * The completeness test would also fail if 'me' moved to NOT_LIVE - this
     * one says why that would be wrong.
     */
    expect(LIVE_KEYS_FOR_TEST, "'me' must be refreshed: it carries the viewer's seat")
      .toContain('me')
    expect(NOT_LIVE, "'me' must not be excluded: seating is a chain entry").not.toContain('me')
  })

  it('leaves the immutable and out-of-band reads alone', () => {
    /*
     * The exclusions are a claim about the data, so each is asserted rather
     * than left to a comment: 'entry' and 'alloc' read one past entry, which
     * an append-only chain cannot change; 'preview' is keyed on the viewer's
     * own form input; 'flats' is a registry table no chain entry writes.
     */
    for (const k of ['entry', 'alloc', 'preview', 'flats']) {
      expect(NOT_LIVE, `${k} is excluded on purpose`).toContain(k)
      expect(LIVE_KEYS_FOR_TEST, `${k} must not be refetched on every insert`).not.toContain(k)
    }
  })
})

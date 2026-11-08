/*
 * READING THE PUBLISHED ANCHOR FILE, IN THE FIELD NAMES THE CONTRACT USES.
 *
 * `fetchAnchor` had no tests at all, and that is exactly how it came to read
 * a shape nobody publishes: it took `j.head ?? j` and then `h.hash` and
 * `h.highest_sequence`, which are `api_head`'s names. anchor/v1.md publishes
 * a FLAT file with `head_hash` and `head_seq`, so against a real file both
 * reads were undefined, the shape check failed, and every anchor read
 * returned 'unreachable'.
 *
 * That is the quietest failure available on this screen. 'unreachable' is a
 * plausible answer - the host really can be down - so the one check that
 * proves no entry was LEFT OUT would have reported "couldn't reach it"
 * forever, indistinguishable from a publisher that was never switched on.
 *
 * SO THE FIXTURE IS COPIED FROM THE CONTRACT, not written in our own names.
 * A fixture spelled the way the reader expects can only prove the reader
 * agrees with itself - the same vacuity that hid the limitEntries bug. The
 * field names below must be read against contracts/anchor/v1.md, and the
 * guard test asserts the happy path really does parse, so a later rename
 * cannot leave every case passing against nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAnchor } from './verify'

const SOCIETY = 'soc_gulmohar'
const HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

/* The example file from anchor/v1.md, keys as published. */
const published = (over: Record<string, unknown> = {}) => ({
  schema_version: 1,
  society_id: SOCIETY,
  period: '2026-10',
  head_seq: 412,
  entry_count: 412,
  head_hash: HASH,
  hash_alg: 'sha256',
  format_version: 1,
  as_of: 1793471999000,
  published_at: '2026-11-01T01:00:00.000Z',
  ...over,
})

const serve = (body: unknown, status = 200) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })))
}

beforeEach(() => {
  vi.stubEnv('VITE_ANCHOR_URL', 'https://raw.githubusercontent.com/anchors/cf/main/{society}.json')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('reading a published anchor file', () => {
  /*
   * THE GUARD. If this fails, every refusal case below is passing against a
   * reader that refuses everything, which is the shape that looks fully
   * tested while proving nothing.
   */
  it('parses the contract example, so the refusals below are not vacuous', async () => {
    serve(published())
    const a = await fetchAnchor(SOCIETY)
    expect(a, 'the contract example must parse').not.toBe('unreachable')
    expect(a).not.toBe('unpublished')
  })

  it('reads the head from head_hash and head_seq, not our own field names', async () => {
    serve(published())
    const a = await fetchAnchor(SOCIETY)
    expect(typeof a).toBe('object')
    const h = a as Exclude<typeof a, string>
    expect(h.hash).toBe(HASH)
    expect(h.highest_sequence).toBe(412)
    expect(h.entry_count).toBe(412)
  })

  /* The names that were read before. A file carrying ONLY those must not
   * parse, or the old bug is simply inverted. */
  it('refuses a file written in api_head\'s names instead of the contract\'s', async () => {
    serve({ hash: HASH, highest_sequence: 412, entry_count: 412, as_of: 1, format_version: 1 })
    expect(await fetchAnchor(SOCIETY)).toBe('unreachable')
  })

  it('refuses a file wrapped in a head object, which v1 does not publish', async () => {
    serve({ head: published() })
    expect(await fetchAnchor(SOCIETY)).toBe('unreachable')
  })
})

describe('the three refusals the Unreadable row names', () => {
  /*
   * Each is a case the server could otherwise walk through, and each must
   * read as NOT VERIFIED - never as passed, and never as a mismatch, which
   * would accuse the ledger of something the file cannot establish.
   */
  it('refuses a schema_version it does not know, rather than guessing v1', async () => {
    serve(published({ schema_version: 2 }))
    expect(await fetchAnchor(SOCIETY)).toBe('unreachable')
  })

  it('refuses a hash_alg it does not know, because the digests are not comparable', async () => {
    serve(published({ hash_alg: 'sha512' }))
    expect(await fetchAnchor(SOCIETY)).toBe('unreachable')
  })

  /*
   * THE ONE THAT IS AN ATTACK RATHER THAN A MISCONFIGURATION. A valid,
   * correctly published anchor for a DIFFERENT society satisfies every other
   * check in this file while proving nothing about the society on screen.
   */
  it('refuses a valid anchor published for a different society', async () => {
    serve(published({ society_id: 'soc_other' }))
    expect(await fetchAnchor(SOCIETY)).toBe('unreachable')
  })
})

describe('a malformed head', () => {
  it.each([
    ['a hash that is not hex', { head_hash: 'not-a-hash' }],
    ['a truncated hash', { head_hash: HASH.slice(0, 32) }],
    ['an uppercase hash, which the contract says is lowercase hex', { head_hash: HASH.toUpperCase() }],
    ['a sequence of zero', { head_seq: 0 }],
    ['a negative sequence', { head_seq: -1 }],
    ['a float sequence', { head_seq: 412.5 }],
    ['a sequence as a string', { head_seq: '412' }],
    ['an absent entry_count', { entry_count: undefined }],
  ])('refuses %s', async (_label, over) => {
    serve(published(over))
    expect(await fetchAnchor(SOCIETY)).toBe('unreachable')
  })

  it('refuses a body that is not an object at all', async () => {
    for (const body of [null, 'a string', 42, []]) {
      serve(body)
      expect(await fetchAnchor(SOCIETY), `accepted ${JSON.stringify(body)}`).toBe('unreachable')
    }
  })

  it('refuses invalid JSON without letting the throw reach the screen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token') },
    })))
    expect(await fetchAnchor(SOCIETY)).toBe('unreachable')
  })
})

describe('what the status code means', () => {
  /*
   * 404 IS NOT 'UNREACHABLE'. The contract separates them: a society younger
   * than a month plus 5 days has nothing published yet, and calling that a
   * failure to reach the host makes an ordinary new society look broken.
   */
  it('reads a 404 as not yet published', async () => {
    serve(published(), 404)
    expect(await fetchAnchor(SOCIETY)).toBe('unpublished')
  })

  it.each([[500], [502], [403]])('reads a %i as unreachable', async (status) => {
    serve(published(), status)
    expect(await fetchAnchor(SOCIETY)).toBe('unreachable')
  })

  it('reads a network error as unreachable, never as published', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect(await fetchAnchor(SOCIETY)).toBe('unreachable')
  })
})

describe('when no anchor is configured', () => {
  /* The normal state today, and it must look like nothing rather than like a
   * failure: VITE_ANCHOR_URL is empty everywhere until the anchor repo
   * exists. It must also not reach the network. */
  it('reports unpublished without fetching anything', async () => {
    vi.stubEnv('VITE_ANCHOR_URL', '')
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await fetchAnchor(SOCIETY)).toBe('unpublished')
    expect(f, 'it must not call out with no anchor configured').not.toHaveBeenCalled()
  })

  it('reports unpublished for an http template, which is refused upstream', async () => {
    vi.stubEnv('VITE_ANCHOR_URL', 'http://anchors.example.org/{society}.json')
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await fetchAnchor(SOCIETY)).toBe('unpublished')
    expect(f, 'a plain-http anchor must never be fetched').not.toHaveBeenCalled()
  })
})

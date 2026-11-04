/*
 * THE ANCHOR URL, WHICH IS BOTH A FETCH TARGET AND AN HREF A RESIDENT CLICKS.
 *
 * VITE_ANCHOR_URL is empty in .env.example, .env.local and the README, so this
 * screen has never run with a real anchor configured. The bug fires the FIRST
 * time anyone sets one - which is the moment the published chain head, a
 * requirement rather than a later addition, actually goes live.
 *
 * The decision is anchorUrl's, not the route's, so the tests drive anchorUrl.
 * The route only renders what it returns.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { anchorUrl } from './verify'

const SOCIETY = 'green-meadows'

afterEach(() => {
  vi.unstubAllEnvs()
})

const withTemplate = (t: string) => {
  vi.stubEnv('VITE_ANCHOR_URL', t)
  return anchorUrl(SOCIETY)
}

describe('an anchor that cannot be rendered', () => {
  it('refuses a relative path rather than throwing where nothing catches', () => {
    /*
     * '/anchors/{society}.json' is the natural thing to write when the head is
     * published into our own static hosting, and `new URL()` throws TypeError
     * on it. There is no error boundary in the tree, so that throw during
     * render blanks the entire verify screen - the one screen whose purpose is
     * proving the record was not altered.
     */
    for (const t of ['/anchors/{society}.json', 'anchors/{society}.json', './head.json', '//example.org/head.json']) {
      expect(() => withTemplate(t)).not.toThrow()
      expect(withTemplate(t), `accepted ${t}`).toBeNull()
    }
  })

  it('refuses a scheme that is not http or https', () => {
    /* The value reaches an href, so a script scheme here is a script sink, and
     * data: or blob: would link to content we did not publish. */
    const bad = [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:application/json,{}',
      'blob:https://example.org/x',
      'file:///etc/passwd',
      'ftp://example.org/head.json',
      'vbscript:msgbox(1)',
    ]
    for (const t of bad) {
      expect(withTemplate(t), `accepted ${t}`).toBeNull()
    }
  })

  it('reads an unset anchor as not published, and a blank one as no address', () => {
    /*
     * Absence is the NORMAL state today - VITE_ANCHOR_URL is empty everywhere
     * - so it must look like nothing rather than like a failure. Whitespace is
     * a misconfiguration, not an address, and must not reach the link either.
     */
    vi.stubEnv('VITE_ANCHOR_URL', '')
    expect(anchorUrl(SOCIETY)).toBeNull()
    for (const t of [' ', '\t', '  \n ']) {
      expect(withTemplate(t), `accepted a blank template ${JSON.stringify(t)}`).toBeNull()
    }
  })
})

describe('an anchor that can be rendered', () => {
  it('accepts an absolute https URL and fills the society in', () => {
    const a = withTemplate('https://anchors.example.org/{society}.json')
    expect(a).not.toBeNull()
    expect(a!.href).toContain(SOCIETY)
    expect(a!.href.startsWith('https://')).toBe(true)
  })

  it('accepts plain http, because a committee may self-host without TLS', () => {
    expect(withTemplate('http://anchors.example.org/{society}.json')).not.toBeNull()
  })

  it('reports a host the route can show without parsing anything again', () => {
    /* The route used to build `new URL(...).host` during render. The host now
     * comes from the same parse that validated the href, so there is no second
     * parse left to throw. */
    const a = withTemplate('https://anchors.example.org:8443/{society}.json')
    expect(a).not.toBeNull()
    expect(a!.host).toBe('anchors.example.org:8443')
    expect(a!.host).not.toContain('/')
    expect(a!.host).not.toContain(SOCIETY)
  })

  it('reports the host of the URL it validated, not of the raw template', () => {
    /*
     * A second parse is not merely wasteful, it can disagree. With the society
     * in the host position the raw template and the filled URL have DIFFERENT
     * hosts, so a host derived from the template would label the link with an
     * address the href does not go to - on the screen a resident uses to decide
     * whether to trust the record.
     */
    const a = withTemplate('https://{society}.anchors.example.org/head.json')
    expect(a).not.toBeNull()
    expect(a!.host).toBe(`${SOCIETY}.anchors.example.org`)
    expect(new URL(a!.href).host).toBe(a!.host)
  })

  it('keeps the society inside its own slot in the template', () => {
    /* The id is encoded, so an id carrying path or query syntax cannot climb
     * out of the segment it was substituted into. */
    vi.stubEnv('VITE_ANCHOR_URL', 'https://anchors.example.org/s/{society}.json')
    const a = anchorUrl('../../evil?x=1#f')
    expect(a).not.toBeNull()
    const u = new URL(a!.href)
    expect(u.host).toBe('anchors.example.org')
    expect(u.pathname.startsWith('/s/')).toBe(true)
    expect(u.search).toBe('')
    expect(u.hash).toBe('')
  })

  it('does not require the template to carry a {society} placeholder', () => {
    /* One society per deployment is a legitimate configuration. */
    expect(withTemplate('https://anchors.example.org/head.json')).not.toBeNull()
  })
})

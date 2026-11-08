import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * The 44px tap-target floor, swept over the source rather than one rendered
 * screen. `crashed.test.tsx` asserts the floor on the crash card, which is the
 * screen where a mis-tap is least recoverable - but a render test can only
 * speak for the screen it mounts, and nine Buttons on five other screens had
 * drifted to `size="sm"` while that suite stayed green. The rule is about the
 * component's use everywhere, so the check has to read every file that uses it.
 *
 * `sm` is h-9 (36px); `md` is h-11 (44px) and is the default. The floor is
 * about the size of a finger, so it does not follow the network assumption or
 * the device budget - a faster phone does not make a thumb smaller.
 *
 * Avatar and Amount also take size="sm", and that is typography, not a tap
 * target. Only `<Button size="sm">` is a 36px hit area, so the pattern is
 * anchored to the Button tag and nothing else.
 */

const SRC = join(import.meta.dirname, '..')

function sources(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...sources(p))
    else if (e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx')) out.push(p)
  }
  return out
}

describe('tap targets', () => {
  const files = sources(SRC)

  it('sweeps a non-empty set of components and routes', () => {
    /*
     * A sweep whose glob matches nothing reports success forever. This asserts
     * the sweep is measuring, and names the two directories that must be in
     * it - a routes/ rename would otherwise retire the check silently.
     */
    expect(files.length).toBeGreaterThan(10)
    expect(files.some((f) => f.includes('routes'))).toBe(true)
    expect(files.some((f) => f.includes('components'))).toBe(true)
  })

  it('has no Button below the 44px floor', () => {
    const bad: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      if (/<Button\s[^>]*size=(["'])sm\1/.test(src)) bad.push(f.replace(SRC, 'src'))
      if (/<Button\s[^>]*size=\{\s*(["'])sm\1\s*\}/.test(src)) bad.push(f.replace(SRC, 'src'))
    }
    expect(bad, `size="sm" is h-9 (36px), below the 44px floor, in:\n${bad.join('\n')}`).toEqual([])
  })

  it('still detects a Button that drops below the floor', () => {
    /*
     * The assertion above passes trivially once the source is clean, so it
     * cannot tell a working check from a broken pattern. These drive the same
     * pattern over text that must match and text that must not.
     */
    const pat = /<Button\s[^>]*size=(["'])sm\1/
    expect(pat.test('<Button size="sm" tone="primary">Sign</Button>')).toBe(true)
    expect(pat.test("<Button size='sm'>Sign</Button>")).toBe(true)
    expect(pat.test('<Button tone="primary" size="sm">Sign</Button>')).toBe(true)
    // Not a tap target: typography on a figure or an avatar.
    expect(pat.test('<Amount minor={v} size="sm" />')).toBe(false)
    expect(pat.test('<Avatar name={n} size="sm" />')).toBe(false)
    // The default and the explicit floor both pass.
    expect(pat.test('<Button tone="primary">Sign</Button>')).toBe(false)
    expect(pat.test('<Button size="md">Sign</Button>')).toBe(false)
  })
})

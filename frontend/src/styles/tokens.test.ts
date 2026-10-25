import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Every ratio is computed from the stylesheet itself, so this file and
// app.css cannot drift apart. WCAG 2.1: (L1 + 0.05) / (L2 + 0.05).

const css = readFileSync(resolve(__dirname, 'app.css'), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const out: Record<string, string> = {}
  for (const m of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]!] = m[2]!
  return out
}

function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}

const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

const themes = { light: block(':root {'), dark: block(":root[data-theme='dark'] {") }

describe.each(Object.entries(themes))('%s theme', (_name, t) => {
  // Text a resident reads: 4.5:1 against the surface it sits on.
  it.each(['ink', 'ink-2', 'credit', 'debit', 'attention', 'anchor', 'break', 'accent'])('%s is legible on surface and background', (k) => {
    expect(ratio(t[k]!, t.surface!)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(t[k]!, t.bg!)).toBeGreaterThanOrEqual(4.5)
  })
  // Tinted chips put the colour on its own soft fill.
  it.each(['credit', 'debit', 'attention', 'anchor', 'break', 'accent'])('%s is legible on its soft fill', (k) => {
    expect(ratio(t[k]!, t[`${k}-soft`]!)).toBeGreaterThanOrEqual(4.5)
  })
  it('the primary button label is legible', () => {
    expect(ratio(t['accent-ink']!, t.accent!)).toBeGreaterThanOrEqual(4.5)
  })
  it('muted text stays legible on the sunken fill', () => {
    expect(ratio(t['ink-2']!, t.sunken!)).toBeGreaterThanOrEqual(4.5)
  })
  it('a strong rule is visible as a graphical object', () => {
    expect(ratio(t['line-strong']!, t.surface!)).toBeGreaterThanOrEqual(3)
  })
})

it('the system dark theme and the chosen dark theme are the same palette', () => {
  expect(block("@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {")).toEqual(themes.dark)
})

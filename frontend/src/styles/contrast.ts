/**
 * WCAG 2.1 relative-luminance and contrast arithmetic.
 *
 * Lives in source rather than in a test file because the design document
 * requires a computed number beside every palette token, and the only way
 * that stays true is if the same function that produced the numbers is the
 * one the suite re-runs.
 */

/** sRGB channel to linear. The 0.03928 threshold is the WCAG 2.1 value. */
function linearize(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** `#rgb` or `#rrggbb` to its three 0-255 channels. */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`not a hex colour: ${hex}`)
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex)
  return (
    0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
  )
}

/** Contrast ratio, 1:1 to 21:1. Order of arguments does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The colour an element actually renders as when `opacity` is applied over
 * a known ground. Opacity on text is the single easiest way to turn a
 * passing token into a failing one, so the suite checks it explicitly
 * rather than trusting the rule not to be broken.
 */
export function composite(fg: string, bg: string, alpha: number): string {
  const [fr, fg_, fb] = parseHex(fg)
  const [br, bg_, bb] = parseHex(bg)
  const blend = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha))
  return (
    '#' +
    [blend(fr, br), blend(fg_, bg_), blend(fb, bb)]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  )
}

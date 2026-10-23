import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyChoice, readChoice, resolve, toggle } from './theme'

function mockPrefersDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({
      matches: dark && q.includes('dark'),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  mockPrefersDark(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('readChoice', () => {
  it('defaults to system when nothing is stored', () => {
    expect(readChoice()).toBe('system')
  })

  it('reads a stored explicit choice', () => {
    localStorage.setItem('cf-theme', 'dark')
    expect(readChoice()).toBe('dark')
  })

  it('ignores a junk stored value rather than applying it', () => {
    localStorage.setItem('cf-theme', 'sepia')
    expect(readChoice()).toBe('system')
  })

  it('returns system when localStorage throws', () => {
    // Private windows and blocked site data make the getter throw rather
    // than return null. The app must still render.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readChoice()).toBe('system')
  })
})

describe('resolve', () => {
  it('follows the OS preference for system', () => {
    mockPrefersDark(true)
    expect(resolve('system')).toBe('dark')
    mockPrefersDark(false)
    expect(resolve('system')).toBe('light')
  })

  it('does not default to light when the OS prefers dark', () => {
    // The design is explicit: a volunteer whose phone is in dark mode and
    // who gets a white ledger at night learns the app ignores their phone.
    mockPrefersDark(true)
    expect(resolve('system')).not.toBe('light')
  })

  it('an explicit choice overrides the OS', () => {
    mockPrefersDark(true)
    expect(resolve('light')).toBe('light')
  })
})

describe('toggle', () => {
  it('is two-state: never returns system', () => {
    // A rotating three-state control makes a volunteer press a button
    // three times to learn what it does. The control has two positions.
    for (const c of ['system', 'light', 'dark'] as const) {
      expect(toggle(c)).not.toBe('system')
    }
  })

  it('flips what is currently on screen, so the first press is visible', () => {
    mockPrefersDark(true)
    expect(toggle('system')).toBe('light')
    mockPrefersDark(false)
    expect(toggle('system')).toBe('dark')
  })

  it('flips an explicit choice', () => {
    expect(toggle('dark')).toBe('light')
    expect(toggle('light')).toBe('dark')
  })
})

describe('applyChoice', () => {
  it('sets the attribute the stylesheet reads', () => {
    applyChoice('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('cf-theme')).toBe('dark')
  })

  it('removes the attribute for system so the media query takes over', () => {
    applyChoice('dark')
    applyChoice('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem('cf-theme')).toBeNull()
  })

  it('still applies the theme when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => applyChoice('dark')).not.toThrow()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})

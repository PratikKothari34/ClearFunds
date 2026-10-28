import { describe, expect, it } from 'vitest'
import { ShapeError, array, bool, int, nullable, object, oneOf, parse, required, str } from './parse'

/*
 * These assert the RULE: what is rejected, and that a rejection names where.
 * No test asserts a sample figure - the parser does not care what the number
 * is, only that it is one.
 */

describe('int', () => {
  /* Exactly money.ts's precondition, so nothing it rejects can reach parts(). */
  const bad: [string, unknown][] = [
    ['null', null], ['undefined', undefined], ['NaN', NaN], ['Infinity', Infinity],
    ['a float', 1.5], ['a numeric string', '1'], ['a boolean', true],
    ['past 2^53', Number.MAX_SAFE_INTEGER + 1],
  ]
  for (const [name, v] of bad) {
    it(`rejects ${name}`, () => {
      expect(() => int(v, 'f')).toThrow(ShapeError)
    })
  }

  it('accepts a safe integer, including zero and negatives', () => {
    for (const v of [0, 1, -1, Number.MAX_SAFE_INTEGER]) expect(int(v, 'f')).toBe(v)
  })
})

describe('nullable vs required', () => {
  /* The distinction the whole module turns on: a nullable column may be
   * null and the surface must cope; a required one being null is a contract
   * violation and must surface rather than be absorbed. */
  it('nullable passes null through as null', () => {
    expect(nullable(int)(null, 'f')).toBeNull()
  })

  it('nullable still checks a non-null value', () => {
    expect(() => nullable(int)('1', 'f')).toThrow(ShapeError)
  })

  it('required rejects null instead of absorbing it', () => {
    expect(() => required(int)(null, 'f')).toThrow(ShapeError)
  })

  /* undefined is a missing key, which is the same failure as null here -
   * a column that did not arrive is not a column that is null. */
  it('required rejects a missing field', () => {
    expect(() => required(int)(undefined, 'f')).toThrow(ShapeError)
  })

  /*
   * required() must do the rejecting ITSELF. Paired with `int` it looks
   * correct either way, because int already rejects null - so that test
   * proves int works, not that required adds anything. With an inner parser
   * that happily accepts null, a required() that does not check is exposed:
   * this is the case where required(nullable(x)) or a hand-rolled permissive
   * parser would let a contract violation through silently.
   */
  const accepting = (v: unknown) => v as string | null

  it('rejects null even when the inner parser would accept it', () => {
    expect(() => required(accepting)(null, 'f')).toThrow(ShapeError)
  })

  it('rejects undefined even when the inner parser would accept it', () => {
    expect(() => required(accepting)(undefined, 'f')).toThrow(ShapeError)
  })

  it('says the contract was violated, not merely that a type was wrong', () => {
    try {
      required(accepting)(null, 'dues.outstanding_minor')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as ShapeError).detail).toContain('never null')
    }
  })

  it('passes a present value through to the inner parser', () => {
    expect(required(accepting)('x', 'f')).toBe('x')
  })
})

describe('oneOf', () => {
  it('rejects a value outside the set', () => {
    expect(() => oneOf(['a', 'b'])('c', 'f')).toThrow(ShapeError)
  })

  it('accepts a member', () => {
    expect(oneOf(['a', 'b'])('b', 'f')).toBe('b')
  })

  /* The server chooses this value, which is the reason it is checked at all:
   * an unknown variant must not reach a switch that has no branch for it. */
  it('rejects null rather than treating it as a variant', () => {
    expect(() => oneOf(['a'])(null, 'f')).toThrow(ShapeError)
  })
})

describe('object', () => {
  const row = object<{ a: number; b: string | null }>({ a: int, b: nullable(str) })

  it('rejects a non-object', () => {
    for (const v of [null, undefined, 1, 'x', [1]]) expect(() => row(v, 'r')).toThrow(ShapeError)
  })

  it('parses declared fields', () => {
    expect(row({ a: 1, b: null }, 'r')).toMatchObject({ a: 1, b: null })
  })

  /*
   * Unknown fields are KEPT. A backend adding a column must not break a
   * deployed frontend, and nothing decides from a field it does not declare.
   * If this ever starts stripping, every hook silently loses data the moment
   * the backend adds anything.
   */
  it('keeps fields it does not declare', () => {
    const out = row({ a: 1, b: 'x', extra: 'kept' }, 'r') as Record<string, unknown>
    expect(out.extra).toBe('kept')
  })

  it('names the failing field in the path', () => {
    try {
      row({ a: null, b: null }, 'dues')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as ShapeError).path).toBe('dues.a')
    }
  })
})

describe('array', () => {
  it('rejects a non-array', () => {
    for (const v of [null, undefined, {}, 'x']) expect(() => array(int)(v, 'r')).toThrow(ShapeError)
  })

  it('accepts an empty array', () => {
    expect(array(int)([], 'r')).toEqual([])
  })

  /* One bad row fails the response. Returning the good rows would hand a
   * surface a silently short list, which is the dues bug again: a count
   * that is wrong in the low direction with nothing saying so. */
  it('fails the whole response on one bad element', () => {
    expect(() => array(int)([1, 'x', 3], 'r')).toThrow(ShapeError)
  })

  it('names the failing index', () => {
    try {
      array(int)([1, null], 'rows')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as ShapeError).path).toBe('rows[1]')
    }
  })
})

describe('error messages', () => {
  /* A message says "got null", not "got object" - the difference between a
   * readable failure and a puzzle. */
  it('distinguishes null from an object', () => {
    try {
      int(null, 'f')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as ShapeError).detail).toContain('null')
    }
  })

  /*
   * A row can carry a resident's name or handle, and an error can land in a
   * log or a screenshot, so a value is described and never printed in full.
   */
  it('does not print a rejected string value', () => {
    try {
      int('Riya Apte', 'f')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as ShapeError).message).not.toContain('Riya')
    }
  })

  it('parse names the hook in the path', () => {
    try {
      parse(object<{ a: number }>({ a: int }), { a: null }, 'useDues')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as ShapeError).path).toBe('useDues.a')
    }
  })
})

describe('bool and str', () => {
  it('bool rejects a truthy non-boolean', () => {
    expect(() => bool(1, 'f')).toThrow(ShapeError)
  })

  it('str rejects null', () => {
    expect(() => str(null, 'f')).toThrow(ShapeError)
  })

  it('str accepts an empty string', () => {
    expect(str('', 'f')).toBe('')
  })
})

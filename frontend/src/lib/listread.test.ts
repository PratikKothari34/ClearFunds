/**
 * The shared answer to "may this screen say there is nothing?".
 *
 * Seven surfaces had their own copy of `(q.data ?? [])` beside an empty-state
 * sentence. These are the decisions all of them now share, tested here rather
 * than through any one screen - a render test speaks only for the screen it
 * mounts, and the computation is the guard.
 */
import { describe, expect, it } from 'vitest'
import { derivedRead, listRead, listReadMap, mayClaimEmpty } from './listread'

const pending = { data: undefined, isPending: true, isError: false }
const failed = { data: undefined, isPending: false, isError: true }

describe('listRead', () => {
  it('does not report a failed read as an empty list', () => {
    // THE DEFECT, in one line.
    expect(listRead(failed).kind).toBe('unknown')
    expect(mayClaimEmpty(listRead(failed))).toBe(false)
  })

  it('does not report a read still in flight as an empty list', () => {
    expect(mayClaimEmpty(listRead(pending))).toBe(false)
  })

  it('tells a failed read apart from one still arriving', () => {
    // Collapsing them gives either a permanent skeleton or a claim from no
    // data; the two surfaces owe the reader different sentences.
    expect(listRead(failed).kind).not.toBe(listRead(pending).kind)
  })

  it('reports an empty list that actually ARRIVED as a real answer', () => {
    const r = listRead({ data: [], isPending: false, isError: false })
    expect(r.kind).toBe('ready')
    expect(mayClaimEmpty(r)).toBe(true)
  })

  it('passes the rows through untouched', () => {
    const rows = [1, 2, 3]
    const r = listRead({ data: rows, isPending: false, isError: false })
    expect(r.kind === 'ready' && r.rows).toEqual([1, 2, 3])
    expect(mayClaimEmpty(r)).toBe(false)
  })

  it('treats a success holding no data as still pending, not as empty', () => {
    // Both flags false with `data` undefined: not a state TanStack should
    // produce, and if it does, the honest answer is that nothing arrived.
    expect(listRead({ data: undefined, isPending: false, isError: false }).kind).toBe('pending')
  })

  it('refuses rows held from a read that has since failed', () => {
    // isError WITH data in hand - a failed background refetch keeps the last
    // successful rows. Presenting them as current is why error is checked
    // before the data is looked at.
    expect(listRead({ data: [1, 2], isPending: false, isError: true }).kind).toBe('unknown')
  })

  it('does not resolve to an answer when both flags are set', () => {
    expect(listRead({ data: undefined, isPending: true, isError: true }).kind).toBe('unknown')
  })

  it('carries no rows field in either refusing state', () => {
    // Reading `.rows` off a refusing state yields undefined and then an empty
    // render: the same silence the module exists to remove.
    expect('rows' in listRead(pending)).toBe(false)
    expect('rows' in listRead(failed)).toBe(false)
  })

  it('reaches all three states, so none of the above is vacuous', () => {
    const kinds = [
      listRead({ data: [], isPending: false, isError: false }).kind,
      listRead(pending).kind,
      listRead(failed).kind,
    ]
    expect([...kinds].sort()).toEqual(['pending', 'ready', 'unknown'])
  })
})

describe('listReadMap', () => {
  it('does not run the transform over a fallback for a failed read', () => {
    // THE DEFECT the function exists to make inexpressible. `(q.data ?? [])
    // .filter(...)` runs the transform over the fallback and yields a
    // confident empty list; here the transform must not run at all.
    let ran = false
    const r = listReadMap(failed, (rows) => { ran = true; return rows })
    expect(r.kind).toBe('unknown')
    expect(ran, 'the transform ran over a read that failed').toBe(false)
    expect(mayClaimEmpty(r)).toBe(false)
  })

  it('does not run the transform while the read is in flight', () => {
    let ran = false
    expect(listReadMap(pending, (rows) => { ran = true; return rows }).kind).toBe('pending')
    expect(ran).toBe(false)
  })

  it('runs the transform once the rows have arrived', () => {
    const r = listReadMap({ data: [1, 2, 3], isPending: false, isError: false }, (rows) => rows.filter((n) => n > 1))
    expect(r.kind === 'ready' && r.rows).toEqual([2, 3])
  })

  it('reports an arrived list the transform emptied as a real answer', () => {
    // The one case that MUST still be claimable: the read succeeded and the
    // filter matched nothing. Refusing here would make every filtered empty
    // list look like a failure.
    const r = listReadMap({ data: [1], isPending: false, isError: false }, () => [])
    expect(mayClaimEmpty(r)).toBe(true)
  })

  it('reaches all three states, so none of the above is vacuous', () => {
    const kinds = [
      listReadMap({ data: [], isPending: false, isError: false }, (r) => r).kind,
      listReadMap(pending, (r) => r).kind,
      listReadMap(failed, (r) => r).kind,
    ]
    expect([...kinds].sort()).toEqual(['pending', 'ready', 'unknown'])
  })
})

describe('derivedRead', () => {
  const ready = { isPending: false, isError: false }

  it('reports ready only when every contributing read arrived', () => {
    const r = derivedRead([1], [ready, ready])
    expect(r.kind).toBe('ready')
    expect(r.kind === 'ready' && r.rows).toEqual([1])
  })

  it('refuses when ANY contributing read failed, even with items in hand', () => {
    // The dashboard's "Nothing needs you right now" was built from six
    // queries. Three obligations shown out of four, announced as the complete
    // set, is worse than saying it is still looking.
    expect(derivedRead([1, 2], [ready, { isPending: false, isError: true }]).kind).toBe('unknown')
  })

  it('refuses when any contributing read is still in flight', () => {
    expect(derivedRead([], [ready, { isPending: true, isError: false }]).kind).toBe('pending')
  })

  it('prefers unknown over pending when both are present', () => {
    // A failure is the more serious fact and the one with a retry attached;
    // reporting a skeleton instead hides it behind an animation.
    const r = derivedRead([], [{ isPending: true, isError: false }, { isPending: false, isError: true }])
    expect(r.kind).toBe('unknown')
  })

  it('does not let an EMPTY derived list be claimed while a read is missing', () => {
    // The exact shape of the defect: `items.length` was 0 because a read
    // failed, and the card then stated there was nothing to do.
    expect(mayClaimEmpty(derivedRead([], [{ isPending: false, isError: true }]))).toBe(false)
  })

  it('an empty derived list from reads that all arrived is a real answer', () => {
    expect(mayClaimEmpty(derivedRead([], [ready, ready]))).toBe(true)
  })

  it('treats no contributing reads as arrived rather than as unknown', () => {
    // A viewer whose role contributes no queries genuinely has nothing
    // waiting; reporting unknown there would make every such card pressing.
    expect(derivedRead([], []).kind).toBe('ready')
  })

  it('reaches all three states, so none of the above is vacuous', () => {
    const kinds = [
      derivedRead([], [ready]).kind,
      derivedRead([], [{ isPending: true, isError: false }]).kind,
      derivedRead([], [{ isPending: false, isError: true }]).kind,
    ]
    expect([...kinds].sort()).toEqual(['pending', 'ready', 'unknown'])
  })
})

describe('mayClaimEmpty', () => {
  it('is false in every state that is not a readable empty answer', () => {
    expect(mayClaimEmpty({ kind: 'pending' })).toBe(false)
    expect(mayClaimEmpty({ kind: 'unknown' })).toBe(false)
    expect(mayClaimEmpty({ kind: 'ready', rows: [1] })).toBe(false)
  })

  it('is true only for a read that arrived holding nothing', () => {
    expect(mayClaimEmpty({ kind: 'ready', rows: [] })).toBe(true)
  })
})

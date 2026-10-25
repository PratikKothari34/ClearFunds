import { describe, expect, it } from 'vitest'
import {
  canReachQuorum,
  policyFault,
  quorumFloor,
  signableSeats,
} from './quorum'
import type { ApprovalPolicy, CommitteeSeat } from './types'

const INR = (minor: number) => ({ minor, currency: 'INR' })

function seat(n: number, status: CommitteeSeat['status']): CommitteeSeat {
  return { seat: n, status }
}

function roster(active: number, other: CommitteeSeat['status'][] = []) {
  const seats: CommitteeSeat[] = []
  for (let i = 0; i < active; i++) seats.push(seat(i + 1, 'active'))
  other.forEach((s, i) => seats.push(seat(active + i + 1, s)))
  return seats
}

describe('quorumFloor', () => {
  /*
   * THE RULE, NOT A TABLE OF ANSWERS. Each case asserts against a
   * freshly computed ceil(2M/3) rather than a literal, so a wrong
   * expectation cannot be "fixed" by editing the number — the only way
   * to make this pass is for the function to implement the rule.
   */
  it('is at least two-thirds of the seats', () => {
    for (let m = 2; m <= 25; m++) {
      const got = quorumFloor(m)
      expect(got).not.toBeNull()
      expect(got! * 3).toBeGreaterThanOrEqual(2 * m)
    }
  })

  it('rounds up, never down', () => {
    // The distinguishing property: one fewer would fall below two-thirds.
    for (let m = 2; m <= 25; m++) {
      const got = quorumFloor(m)!
      expect((got - 1) * 3).toBeLessThan(2 * m)
    }
  })

  it('never reduces to one person, at any committee size', () => {
    // 0004's real invariant. A floor of 1 at any M would make the tier
    // a laundering path.
    for (let m = 2; m <= 25; m++) {
      expect(quorumFloor(m)!).toBeGreaterThanOrEqual(2)
    }
  })

  it('rejects a seat count that is not a committee', () => {
    for (const bad of [1, 0, -5, 1.5, NaN, Infinity]) {
      expect(quorumFloor(bad)).toBeNull()
    }
  })
})

describe('policyFault', () => {
  const sound = (seats: number): ApprovalPolicy => ({
    seats,
    quorumRequired: quorumFloor(seats)!,
    limit: INR(0),
  })

  it('accepts a policy sitting exactly on the floor', () => {
    for (let m = 2; m <= 20; m++) {
      expect(policyFault(sound(m))).toBeNull()
    }
  })

  it('accepts a committee that configured a higher threshold', () => {
    for (let m = 5; m <= 20; m++) {
      const floor = quorumFloor(m)!
      if (floor >= m) continue
      expect(policyFault({ ...sound(m), quorumRequired: floor + 1 })).toBeNull()
    }
  })

  it('rejects any threshold below two-thirds', () => {
    // The bug class this guard exists for: a snapshot claiming less
    // than the statutory floor must never be shown as the rule.
    for (let m = 3; m <= 20; m++) {
      const floor = quorumFloor(m)!
      expect(
        policyFault({ ...sound(m), quorumRequired: floor - 1 }),
      ).toBe('quorum-below-floor')
    }
  })

  it('rejects a threshold no roster could ever meet', () => {
    for (let m = 2; m <= 20; m++) {
      expect(policyFault({ ...sound(m), quorumRequired: m + 1 })).toBe(
        'quorum-above-seats',
      )
    }
  })

  it('rejects a non-integer threshold rather than comparing it', () => {
    // Every comparison against NaN is false in both directions, so a
    // bare `<` guard neither accepts nor rejects it and the answer
    // falls through to whatever branch comes next.
    for (const bad of [NaN, Infinity, 2.5]) {
      expect(policyFault({ ...sound(9), quorumRequired: bad })).not.toBeNull()
    }
  })
})

describe('signableSeats', () => {
  it('counts only seats that hold a usable key', () => {
    const r = roster(4, ['restricted', 'vacant', 'restricted'])
    expect(signableSeats(r)).toBe(r.filter((s) => s.status === 'active').length)
  })

  it('is not the denominator: restricting a seat does not shrink M', () => {
    // The resign-your-way-to-a-lower-threshold attack. M comes from
    // policy.seats, which this function must never influence.
    const policy: ApprovalPolicy = {
      seats: 11,
      quorumRequired: quorumFloor(11)!,
      limit: INR(0),
    }
    const full = roster(11)
    const depleted = roster(4, ['vacant', 'vacant', 'vacant', 'vacant', 'vacant', 'vacant', 'vacant'])
    expect(signableSeats(full)).toBeGreaterThan(signableSeats(depleted))
    // The requirement is identical in both worlds.
    expect(policyFault(policy)).toBeNull()
    expect(policy.quorumRequired).toBe(quorumFloor(policy.seats))
  })
})

describe('canReachQuorum', () => {
  const policy = (seats: number): ApprovalPolicy => ({
    seats,
    quorumRequired: quorumFloor(seats)!,
    limit: INR(0),
  })

  it('holds when enough seats can sign', () => {
    const p = policy(11)
    expect(canReachQuorum(roster(p.quorumRequired), p)).toBe(true)
  })

  it('fails when one seat short of the threshold', () => {
    const p = policy(11)
    expect(canReachQuorum(roster(p.quorumRequired - 1), p)).toBe(false)
  })

  it('detects a blocked committee at every size', () => {
    for (let m = 3; m <= 20; m++) {
      const p = policy(m)
      expect(canReachQuorum(roster(p.quorumRequired), p)).toBe(true)
      expect(canReachQuorum(roster(p.quorumRequired - 1), p)).toBe(false)
    }
  })
})

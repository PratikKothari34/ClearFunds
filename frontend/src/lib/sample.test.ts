import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classify, tally } from './countable'
import {
  SAMPLE_ADJUSTMENTS,
  SAMPLE_APPROVALS,
  SAMPLE_AUDIT_YEARS,
  SAMPLE_COMMITTEE,
  SAMPLE_ENTRIES,
  SAMPLE_FLATS,
  SAMPLE_LIMIT,
  mostSeriousOpinion,
  opinionLabel,
  type SampleAuditYear,
} from './sample'

/*
 * These assert RULES, never the sample's numbers. An assertion on
 * `=== 3` gets "fixed" by editing the expected number, which deletes the
 * test's meaning while leaving it green.
 *
 * Two jobs here:
 *
 *   1. `mostSeriousOpinion` implements a statutory ranking that is NOT
 *      alphabetical and NOT chronological. Both wrong orders are tested
 *      explicitly, because both look plausible in a diff.
 *   2. The fixtures exist to exercise the awkward cases. A later tidy-up
 *      that removes the unreadable flat or the qualified year would leave
 *      every screen looking correct and every hard branch untested, so the
 *      fixtures are guarded for the PROPERTY, not for their contents.
 */

const year = (
  y: string,
  opinion: SampleAuditYear['opinion'],
): SampleAuditYear => ({
  year: y,
  opinion,
  auditor: 'Test auditor',
  signedOffAt: '2025-01-01T00:00:00+05:30',
})

describe('mostSeriousOpinion', () => {
  it('ranks a disclaimer above an adverse opinion', () => {
    /*
     * The one that reads backwards in plain English: an auditor who could
     * not form an opinion at all is a WORSE outcome than one who formed a
     * bad one. Getting this pair the wrong way round is the whole risk.
     */
    const worst = mostSeriousOpinion([
      year('2024-25', 'adverse'),
      year('2023-24', 'disclaimer'),
    ])

    expect(worst?.opinionLabel).toBe(opinionLabel('disclaimer'))
  })

  it('orders all four from least to most serious', () => {
    const order: SampleAuditYear['opinion'][] = [
      'clean',
      'qualified',
      'adverse',
      'disclaimer',
    ]

    /*
     * Each opinion must beat every one before it in the list. This is the
     * ranking itself, asserted pairwise, so a single swapped entry fails
     * rather than being masked by the extremes still being right.
     */
    for (let i = 1; i < order.length; i += 1) {
      for (let j = 0; j < i; j += 1) {
        const worst = mostSeriousOpinion([
          year('a', order[j]!),
          year('b', order[i]!),
        ])
        expect(worst?.opinionLabel).toBe(opinionLabel(order[i]!))
      }
    }
  })

  it('is not alphabetical', () => {
    /* Alphabetically "adverse" sorts before "clean", so a naive sort or a
     * localeCompare would pick clean as the most serious here. */
    const worst = mostSeriousOpinion([
      year('2024-25', 'clean'),
      year('2023-24', 'adverse'),
    ])

    expect(worst?.opinionLabel).toBe(opinionLabel('adverse'))
  })

  it('does not simply return the most recent year', () => {
    /*
     * The headline is the most serious opinion EVER received. Two clean
     * years after a qualified one must not bury it - that is the exact
     * way a society would hide a bad audit.
     */
    const worst = mostSeriousOpinion([
      year('2025-26', 'clean'),
      year('2024-25', 'clean'),
      year('2023-24', 'qualified'),
    ])

    expect(worst?.opinionLabel).toBe(opinionLabel('qualified'))
  })

  it('returns null for no audited years rather than claiming clean', () => {
    /* A society with no audit has not been given a clean opinion.
     * Defaulting to one would be a claim nobody made. */
    expect(mostSeriousOpinion([])).toBeNull()
  })

  it('gives every opinion a distinct label', () => {
    const labels = new Set(
      (['clean', 'qualified', 'adverse', 'disclaimer'] as const).map(
        opinionLabel,
      ),
    )

    expect(labels.size).toBe(4)
  })
})

describe('the sample fixtures keep the hard cases', () => {
  it('includes a flat whose arrears figure cannot be read', () => {
    /*
     * The bug this guards: `NaN > 0` is false, so an unreadable figure
     * took the same branch as a flat that had paid and the arrears count
     * came out TOO LOW. Remove this flat and that branch stops rendering
     * on any screen.
     */
    const counts = tally(SAMPLE_FLATS.map((f) => f.arrears))

    expect(counts.unreadable).toBeGreaterThan(0)
  })

  it('includes flats that are owing and flats that are clear', () => {
    /* All three partitions must appear, or the matrix is only ever seen
     * in one state. */
    const counts = tally(SAMPLE_FLATS.map((f) => f.arrears))

    expect(counts.positive).toBeGreaterThan(0)
    expect(counts.zeroOrNegative).toBeGreaterThan(0)
  })

  it('partitions every flat into exactly one of the three', () => {
    const counts = tally(SAMPLE_FLATS.map((f) => f.arrears))

    expect(counts.positive + counts.zeroOrNegative + counts.unreadable).toBe(
      counts.total,
    )
  })

  it('never lets an unreadable figure classify as paid', () => {
    for (const flat of SAMPLE_FLATS) {
      if (flat.arrears === null) {
        expect(classify(flat.arrears).kind).toBe('unreadable')
      }
    }
  })

  it('includes an opinion worse than clean', () => {
    /* A sample where every year is clean never exercises the
     * most-serious-opinion rule at all. */
    const worst = mostSeriousOpinion(SAMPLE_AUDIT_YEARS)

    expect(worst).not.toBeNull()
    expect(worst?.opinionLabel).not.toBe(opinionLabel('clean'))
  })

  it('includes a reversed entry paired with its reversal', () => {
    const reversals = SAMPLE_ENTRIES.filter((e) => e.status === 'reversal')
    expect(reversals.length).toBeGreaterThan(0)

    for (const reversal of reversals) {
      /* A reversal must name what it reverses, carry a reason, and that
       * original must exist and be marked reversed. */
      expect(reversal.reverses).not.toBeNull()
      expect(reversal.reversalReason).toBeTruthy()

      const original = SAMPLE_ENTRIES.find((e) => e.id === reversal.reverses)
      expect(original).toBeDefined()
      expect(original?.status).toBe('reversed')
    }
  })

  it('prints no running balance against either half of a reversed pair', () => {
    /*
     * A reversed pair nets to zero by construction, so a running balance
     * against either half would show a figure that never stood.
     */
    for (const entry of SAMPLE_ENTRIES) {
      if (entry.status === 'reversed' || entry.status === 'reversal') {
        expect(entry.balanceAfter).toBeNull()
      }
    }
  })

  it('includes an adjusting entry against a closed year, with a reason', () => {
    /* Each must be disclosable at the AGM by year, amount and reason -
     * the report generates that section so it cannot be left out. */
    expect(SAMPLE_ADJUSTMENTS.length).toBeGreaterThan(0)

    for (const a of SAMPLE_ADJUSTMENTS) {
      expect(a.correctsYear).toBeTruthy()
      expect(a.reason.trim().length).toBeGreaterThan(0)
    }
  })

  it('carries a currency code on every amount', () => {
    /* Nothing hardcodes a division by 100: JPY has 0 decimal places and
     * KWD has 3, so the code must travel with the figure. */
    const amounts = [
      ...SAMPLE_ENTRIES.map((e) => e.amount),
      ...SAMPLE_APPROVALS.map((a) => a.amount),
      ...SAMPLE_ADJUSTMENTS.map((a) => a.amount),
      SAMPLE_LIMIT.limit,
    ]

    for (const money of amounts) {
      if (money === null) continue
      expect(money.currency).toBeTruthy()
      expect(Number.isInteger(money.minor)).toBe(true)
    }
  })
})

describe('the sample approval tiers', () => {
  it('never reduces a tier to a single approver', () => {
    /*
     * The real invariant of the whole approval model: no single admin
     * moves the ledger alone. The tier trades a large majority for a pair,
     * never for one person, at any limit including zero.
     */
    expect(SAMPLE_LIMIT.atOrBelowNeeds).toBeGreaterThanOrEqual(2)

    for (const approval of SAMPLE_APPROVALS) {
      expect(approval.approvalsNeeded).toBeGreaterThanOrEqual(2)
    }
  })

  it('sets the above-limit tier at two-thirds of the committee, rounded up', () => {
    /* Derived, not copied: this fails if either the committee size or the
     * threshold is edited without the other. */
    const expected = Math.ceil((2 * SAMPLE_LIMIT.committeeSize) / 3)

    expect(SAMPLE_LIMIT.aboveNeeds).toBe(expected)
  })

  it('states the committee size the limit was set against', () => {
    expect(SAMPLE_LIMIT.committeeSize).toBe(SAMPLE_COMMITTEE.length)
  })

  it('requires the above-limit tier to exceed the at-or-below tier', () => {
    /* A tier that is easier above the limit than below it makes the limit
     * a laundering path. */
    expect(SAMPLE_LIMIT.aboveNeeds).toBeGreaterThan(
      SAMPLE_LIMIT.atOrBelowNeeds,
    )
  })

  it('never holds more approvals than it needs', () => {
    for (const approval of SAMPLE_APPROVALS) {
      expect(approval.approvalsHeld).toBeLessThanOrEqual(
        approval.approvalsNeeded,
      )
      /* Still pending, so it cannot already be satisfied. */
      expect(approval.approvalsHeld).toBeLessThan(approval.approvalsNeeded)
    }
  })

  it('lists one signer for each approval already held', () => {
    for (const approval of SAMPLE_APPROVALS) {
      expect(approval.signedBy.length).toBe(approval.approvalsHeld)
    }
  })
})

describe('the sample data is self-evidently not real', () => {
  it('publishes no fingerprint, hash or signature anywhere in the module', () => {
    /*
     * The one rule with no exception. Every other sample value announces
     * itself as invented on sight; a 64-character hex string is
     * INDISTINGUISHABLE from a real one, and the record-check screen
     * exists to be shown at an AGM.
     *
     * This reads the MODULE SOURCE rather than walking known fields, and
     * that shape is the point. An earlier version listed the strings to
     * check - descriptions, counterparties, member names - and a hash
     * planted in `SAMPLE_SOCIETY`, a field nobody had thought to list,
     * sailed through it. A guard that enumerates what to look at can only
     * ever catch what its author already remembered; one that reads
     * everything catches the export added next month too.
     *
     * Caught by mutation: planting a hex run in `SAMPLE_SOCIETY` left the
     * enumerated version green.
     */
    const source = readFileSync(join(import.meta.dirname, 'sample.ts'), 'utf8')

    /*
     * Comments are stripped first. The header comment explains WHY no
     * fingerprint may appear, and prose about hashes is not a hash - but
     * a long hex run inside a string literal is.
     */
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')

    /*
     * Sixteen hex characters is well past any plausible voucher number or
     * date, and far short of the 64 a SHA-256 prints - so a truncated or
     * "shortened for display" fingerprint is caught too, which is the
     * version someone would reach for believing it was harmless.
     */
    const runs = code.match(/\b[0-9a-f]{16,}\b/gi)

    expect(runs).toBeNull()
  })

  it('leaves the record-check fixtures absent entirely', () => {
    /*
     * Not empty strings - absent. An empty fingerprint field invites a
     * later "fill this in" with something plausible; a missing one has to
     * be designed deliberately.
     */
    for (const entry of SAMPLE_ENTRIES) {
      expect(entry).not.toHaveProperty('fingerprint')
      expect(entry).not.toHaveProperty('hash')
      expect(entry).not.toHaveProperty('signature')
      expect(entry).not.toHaveProperty('prevHash')
    }
  })
})

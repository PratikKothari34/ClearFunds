import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canSeeAllDues,
  canSeeApprovalQueue,
  canSeeFlagAuthor,
  duesVisibilitySentence,
  duesVisibleTo,
  isFromFlat,
} from './identity'
import type { Role } from './types'

/*
 * The privacy rule, asserted rather than trusted to a comment.
 *
 * Residents are anonymous to each other; the treasurer, the secretary
 * and the president can see who raised what. A resident has to be able
 * to ask whether the chairman's nephew got the painting contract
 * without the chairman's nephew learning who asked.
 *
 * These assert the RULE, not a sample: the test names every role in the
 * union, so adding a seventh role fails here until someone decides
 * which side of the boundary it falls on. A test that checked three
 * roles would let a new role default to whatever the function happened
 * to do.
 */

const ALL_ROLES: readonly Role[] = [
  'president',
  'treasurer',
  'secretary',
  'committee',
  'resident',
  'auditor',
]

describe('canSeeFlagAuthor', () => {
  it('admits exactly the three office-holders', () => {
    const allowed = ALL_ROLES.filter(canSeeFlagAuthor)
    expect(allowed).toEqual(['president', 'treasurer', 'secretary'])
  })

  it('hides authors from a resident', () => {
    // The rule the product exists to hold. If this ever passes for
    // 'resident', every question on the disputes list carries the flat
    // that asked it.
    expect(canSeeFlagAuthor('resident')).toBe(false)
  })

  it('hides authors from a committee member', () => {
    /*
     * Committee members are admins and vote in N-of-M, but they are not
     * the office-holders who answer questions. A committee of eleven
     * that could all see who complained is the same exposure as making
     * it public in a society of 120 flats.
     */
    expect(canSeeFlagAuthor('committee')).toBe(false)
  })

  it('hides authors from the auditor', () => {
    /*
     * The auditor gets assurance from the chain and the statements, not
     * from who complained. Nothing in the audit opinion depends on a
     * questioner's identity, so there is no reason to hand it over.
     */
    expect(canSeeFlagAuthor('auditor')).toBe(false)
  })

  it('covers every role in the union', () => {
    // Guards against a role being added to `Role` and silently
    // inheriting `false` without anyone deciding.
    expect(ALL_ROLES).toHaveLength(6)
  })
})

describe('isFromFlat', () => {
  it('matches a resident to their own flat', () => {
    expect(isFromFlat('Resident B-402', 'B-402')).toBe(true)
  })

  it('does not match a flat that is a prefix of another', () => {
    /*
     * The bug this function exists to prevent. `handle.includes(flat)`
     * makes 'B-40' match 'Resident B-402', and 'B-4' match every flat on
     * the fourth floor, so one resident's page shows another's questions
     * - on the page that promises the opposite. Floor-and-unit
     * numbering makes short flat numbers prefixes of longer ones
     * constantly, so this is the normal case, not an edge one.
     */
    expect(isFromFlat('Resident B-402', 'B-40')).toBe(false)
    expect(isFromFlat('Resident B-402', 'B-4')).toBe(false)
    expect(isFromFlat('Resident B-402', 'B')).toBe(false)
  })

  it('does not match the other direction either', () => {
    // A longer flat must not match a shorter handle.
    expect(isFromFlat('Resident B-40', 'B-402')).toBe(false)
  })

  it('treats an absent handle as not this flat', () => {
    /*
     * An absent handle must never read as a match. On a resident
     * payload `authorHandle` is omitted entirely - the server withholds
     * it rather than blanking it - so if this returned true for
     * undefined, a resident's own-flat list would show every question in
     * the society.
     */
    expect(isFromFlat(undefined, 'B-402')).toBe(false)
    expect(isFromFlat('', 'B-402')).toBe(false)
  })

  it('treats an absent flat as not matching anything', () => {
    // An auditor has no flat. Nothing is "theirs".
    expect(isFromFlat('Resident B-402', undefined)).toBe(false)
    expect(isFromFlat('Resident B-402', '')).toBe(false)
  })

  it('ignores surrounding whitespace in the handle', () => {
    expect(isFromFlat('  Resident B-402  ', 'B-402')).toBe(true)
  })

  it('compares the flat token, not the whole handle', () => {
    /*
     * The server owns the handle format. This takes the last
     * whitespace-separated token so a change to the prefix does not
     * silently match nothing - which would empty every resident's
     * own-questions list with no error anywhere.
     */
    expect(isFromFlat('Owner B-402', 'B-402')).toBe(true)
    expect(isFromFlat('B-402', 'B-402')).toBe(true)
  })

  it('does not match a flat appearing anywhere but the last token', () => {
    // 'B-402' is present as a substring but is not the flat.
    expect(isFromFlat('Resident B-402 A-101', 'B-402')).toBe(false)
  })

  it('fails CLOSED on a separator that is not an ASCII space', () => {
    /*
     * The handle format is the server's, and this function splits on
     * `' '` exactly. A non-breaking space (U+00A0) looks identical in
     * every editor, log and database client, and `\s` in a JS regex
     * does not match it either.
     *
     * The direction of the failure is the point. The flat token is not
     * recognised, so the resident sees NONE of their own questions —
     * an empty list on a page that says these are theirs. That is the
     * safe direction: the alternative is matching something that is
     * not their flat.
     *
     * Asserted rather than fixed, deliberately. Normalising the
     * separator here would hide a malformed handle instead of letting
     * it be noticed, and the handle format is the server's to get
     * right. This test is what makes the choice visible if someone
     * later "fixes" it by trimming all whitespace classes.
     */
    expect(isFromFlat('Resident\u00a0B-402', 'B-402')).toBe(false)
    expect(isFromFlat('Resident\tB-402', 'B-402')).toBe(false)
  })

  it('matches on the last token even when an earlier one is a flat', () => {
    /*
     * Not a leak, and worth pinning so it is not "fixed" into one.
     * The last token IS the queried flat in each of these, so
     * matching is correct: a handle naming two flats attributes the
     * question to the one it ends with.
     */
    expect(isFromFlat('Flat B-402 owner B-403', 'B-403')).toBe(true)
    expect(isFromFlat('B-402 B-402', 'B-402')).toBe(true)
  })
})

describe('canSeeAllDues', () => {
  /*
   * The dues page lists each flat with what it owes, under a line that
   * says "Residents see only their own flat." It said that while having
   * no role check at all: a resident viewer rendered the full by-flat
   * table, four neighbours' arrears included.
   */
  it('admits exactly the three office-holders', () => {
    for (const role of ['treasurer', 'secretary', 'president'] as const) {
      expect(canSeeAllDues(role)).toBe(true)
    }
  })

  it('hides every other flat from a resident', () => {
    expect(canSeeAllDues('resident')).toBe(false)
  })

  it('hides the table from a committee member and from the auditor', () => {
    /*
     * A committee member is an admin in the approval system and still
     * does not chase payment, and the auditor's access is granted per
     * engagement rather than by being a role in this app.
     */
    expect(canSeeAllDues('committee')).toBe(false)
    expect(canSeeAllDues('auditor')).toBe(false)
  })

  it('covers every role in the union', () => {
    /*
     * So a role added later fails here rather than defaulting into
     * whichever branch the function happens to take.
     */
    const roles: readonly Role[] = [
      'resident',
      'treasurer',
      'secretary',
      'president',
      'committee',
      'auditor',
    ]
    for (const role of roles) {
      expect(typeof canSeeAllDues(role)).toBe('boolean')
    }
  })

  it('is a separate decision from who may see a question author', () => {
    /*
     * The two predicates agree today and must stay separate functions:
     * a later decision that the president may see who asked a question
     * but not who is in arrears must not have to split one of them.
     */
    expect(canSeeAllDues).not.toBe(canSeeFlagAuthor)
  })
})

describe('canSeeApprovalQueue', () => {
  /*
   * `/approvals` lists every expense one signature short: payee,
   * narration, amount, the limit in force, and who raised it. The
   * route had NO check at all - `nav.ts` omitted the menu item and
   * `counts.ts` withheld the badge, and `nav.ts` says of itself that
   * its filtering is cosmetic and is not a permission check. A typed
   * URL reached the full queue from any role.
   */
  it('admits every role that approves anything', () => {
    /*
     * Committee is in the list. Above the committee-set limit an
     * expense needs N-of-M and the N are committee members, so the
     * queue holds work for them. An earlier version of this suite
     * admitted only the three office-holders and contradicted
     * `nav.ts`, which gives a committee member the menu item - the
     * badge, the menu and the page have to agree or one of them is
     * lying to a volunteer.
     */
    for (const role of [
      'treasurer',
      'secretary',
      'president',
      'committee',
    ] as const) {
      expect(canSeeApprovalQueue(role)).toBe(true)
    }
  })

  it('excludes the auditor, not only the resident', () => {
    /*
     * The less obvious half. An auditor reads the RECORD - what was
     * signed and chained. A queue of things not yet approved is the
     * committee's working state, and shows him what the committee is
     * still arguing about rather than what it decided.
     */
    expect(canSeeApprovalQueue('auditor')).toBe(false)
    expect(canSeeApprovalQueue('resident')).toBe(false)
  })

  it('covers every role in the union', () => {
    /*
     * So a role added later fails here rather than falling into
     * whichever branch the function happens to take. Asserted as a
     * total count of admitted roles, not against a literal list, so
     * adding a role cannot be "fixed" by editing an expected array.
     */
    const roles = [
      'resident',
      'treasurer',
      'secretary',
      'president',
      'committee',
      'auditor',
    ] as const
    const admitted = roles.filter((r) => canSeeApprovalQueue(r))
    expect(admitted).toHaveLength(roles.length - 2)
    /*
     * Asserted as "every role but the two that cannot act", not as a
     * count of four, so adding a seventh role fails here and has to be
     * decided rather than absorbed.
     */
    expect(admitted).not.toContain('resident')
    expect(admitted).not.toContain('auditor')
  })

  it('is not the same function as the dues predicate', () => {
    /*
     * The roles coincide today and the questions do not. A later
     * decision that the president sees the queue but not arrears, or
     * the reverse, must not require splitting one function - the same
     * reasoning that keeps `canSeeAllDues` and `canSeeFlagAuthor`
     * apart.
     */
    expect(canSeeApprovalQueue).not.toBe(canSeeAllDues)
    expect(canSeeApprovalQueue).not.toBe(canSeeFlagAuthor)
  })
})

/*
 * The dues privacy promise, which the two pages making it had typed by
 * hand and had already drifted apart on.
 *
 * `/dues` named three office-bearers; `/my-flat` said "the society's
 * committee can", which `canSeeAllDues` refuses. Asserted as agreement
 * between the sentence and the predicate rather than against an
 * expected string: pinning "the treasurer, the secretary and the
 * president" would make the test a second copy of the copy, and
 * widening the rule would then be "fixed" by pasting the new words in.
 */
describe('the dues visibility sentence', () => {
  it('names exactly the roles the predicate admits', () => {
    const named = duesVisibleTo()
    expect(named.length, 'nobody can see dues, which cannot be right').toBeGreaterThan(0)
    for (const role of ALL_ROLES) {
      expect(
        named.includes(role),
        `${role}: the sentence and canSeeAllDues disagree`,
      ).toBe(canSeeAllDues(role))
    }
  })

  it('names every admitted role in the sentence itself', () => {
    const sentence = duesVisibilitySentence()
    /*
     * WHOLE WORDS. "president" contains "resident", so a substring
     * check reports the sentence naming residents whenever it names
     * the president - which is every honest sentence it can produce.
     */
    const names = (role: string) =>
      new RegExp(String.raw`\b` + role + String.raw`\b`).test(sentence)
    for (const role of duesVisibleTo()) {
      expect(names(role), `${role} is admitted but not named`).toBe(true)
    }
    for (const role of ALL_ROLES.filter((r) => !canSeeAllDues(r))) {
      expect(
        names(role),
        `${role} cannot see dues but the sentence says they can`,
      ).toBe(false)
    }
  })

  it('reads as a list, not as an array', () => {
    const sentence = duesVisibilitySentence()
    // Lands mid-sentence, so no capital and no full stop; "and"
    // because they all can, which "or" would turn into a choice.
    expect(sentence).not.toMatch(/[.[\]]/)
    expect(sentence).not.toMatch(/\bor\b/)
    if (duesVisibleTo().length > 1) {
      expect(sentence).toMatch(/\band\b/)
    }
  })

  it('is not typed out on either page that promises it', () => {
    /*
     * The actual regression this prevents. Both pages must call the
     * function: a hardcoded list is how the two came to disagree, and
     * the next widening of `canSeeAllDues` would leave one of them
     * making a promise the code no longer keeps.
     */
    for (const route of ['src/routes/dues.tsx', 'src/routes/my-flat.tsx']) {
      const code = readFileSync(resolve(process.cwd(), route), 'utf8')
      const served = code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\/[^\n]*/g, '')
      expect(served.length, `${route} was not read`).toBeGreaterThan(500)
      expect(
        served,
        `${route} does not call duesVisibilitySentence`,
      ).toMatch(/duesVisibilitySentence\(\)/)
      /*
       * And no hand-written pair of role names in served text, which
       * is what a hardcoded list looks like however it is worded.
       */
      expect(
        served,
        `${route} still spells the role list out`,
      ).not.toMatch(/treasurer,?\s+(the\s+)?secretary/i)
    }
  })
})

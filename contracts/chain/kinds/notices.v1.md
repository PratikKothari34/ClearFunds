# Notice and vote kinds, format_version 1

- **Status:** proposed (#13)
- **Extends:** [`../entry-preimage.v1.md`](../entry-preimage.v1.md) §5. Additive: no
  existing hash changes.
- **Producer:** backend (`cf.kinds`) · **Consumer:** frontend verifier (`KINDS`)
- **Test vectors:** [`../vectors/notices-kinds.v1.json`](../vectors/notices-kinds.v1.json)

A notice is chained when it is published, after the committee has reviewed
it. A notice may carry a vote, cast once per flat. A proposal may cite a
closed vote, and still needs its own approvals (AGENTS.md item 15).

---

### `notice` (actor: the president)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `title` | text | 1–120 characters |
| 2 | `body` | text | 1–5,000 characters |
| 3 | `attachments` | list\<bytes\> | SHA-256 of each attached file, in the order shown. Empty when none |
| 4 | `revision` | int | The revision the committee approved, from 1 |
| 5 | `approvers` | list\<text\> | Person ids that approved that revision, ascending. Includes the president |
| 6 | `corrects_seq` | int? | The notice this one corrects. The corrected notice stays visible |

### `vote_opened` (actor: the president)

Appended in the same transaction as its `notice`.

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `notice_seq` | int | |
| 2 | `question` | text | 1–300 characters |
| 3 | `options` | list\<text\> | 2–10 distinct options, 1–100 characters each, in display order |
| 4 | `max_picks` | int | 1 for a single-choice vote; up to the number of options |
| 5 | `mode` | text | `named` or `anonymous`. Fixed for the life of the vote |
| 6 | `eligible_flats` | int | Flats with an open tenure when the vote opened |
| 7 | `closes_at` | int | Milliseconds since the epoch, UTC. At least one hour after opening |

### `ballot` (actor: absent)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `vote_seq` | int | The `vote_opened` |
| 2 | `flat_id` | text? | `named` votes only |
| 3 | `flat_token` | bytes? | `anonymous` votes only: see below |
| 4 | `options` | list\<int\> | Indexes into `options`, ascending and distinct, 1 to `max_picks` of them |

Exactly one of `flat_id` and `flat_token` is present. **A ballot never names a
person or a pseudonym**: a pseudonym beside a flat would unmask that
resident's flags, and in an anonymous vote it would link their ballots across
votes.

**The flat token** is

```
SHA-256( field(bytes, society_salt) || field(int, vote_seq) || field(text, flat_id) )
```

with the §2 field encoding, the same per-society salt as pseudonyms, never
published or served. Because `vote_seq` is part of the input, **the same flat's
token differs in every vote**, so ballots cannot be linked across votes; the
vectors carry one flat's token in two votes to pin this. Anyone can check that no token appears twice in a vote;
without the salt nobody can tell which flat a token is.

### `vote_closed` (actor: absent)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `vote_seq` | int | |
| 2 | `tallies` | list\<int\> | Ballots naming each option, in option order |
| 3 | `flats_voted` | int | Ballots cast |
| 4 | `eligible_flats` | int | Copied from `vote_opened` |
| 5 | `carried` | int? | Single-choice votes: the index of the option with strictly more ballots than every other. Null for a tie, for no ballots, and for every multi-choice vote |

Any verifier can recount `tallies` and `carried` from the ballots.

### `proposal_ref` (actor: the proposer)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `proposal_seq` | int | Appended in the same transaction as the proposal |
| 2 | `vote_seq` | int | A closed vote |
| 3 | `option` | int | Its `carried` option |

A separate kind because every layout field is in the preimage: adding a field
to `proposal` would rehash every proposal already chained. **The cited vote is
evidence, never an approval**: the proposal needs exactly the approvals it
would need without it.

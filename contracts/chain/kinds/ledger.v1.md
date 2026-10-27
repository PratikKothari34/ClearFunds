# Ledger kinds, format_version 1

- **Status:** proposed
- **Extends:** [`../entry-preimage.v1.md`](../entry-preimage.v1.md) §5. Additive: no
  existing hash changes.
- **Producer:** backend (`backend/supabase/migrations/20261026000001_chain.sql`,
  table `cf.kinds`) · **Consumer:** frontend verifier (`frontend/src/lib/chain.ts`, `KINDS`)

Each kind's body is encoded in the order below. `T?` is an optional field:
encoded as absent (`0x00`) when null, and always present in the sequence.
A verifier MUST treat any kind not listed here, or in a later contract, as
unverifiable.

The two implementations hold their layouts separately on purpose. If the
backend table and the frontend constant disagree, the frontend check fails
on the first entry of that kind, which is the intended outcome.

---

## Money moves in three entries

1. **`proposal`** — what an admin asks for, with the approval rule that will
   apply **snapshotted into the preimage**: the tier, the count required, M
   at the time, and the limit in force with the entry that set it.
2. **`approval`** — one per admin per proposal, signed (§ Signatures).
3. **`posting`** — appended by the system (actor absent) in the same
   transaction as the approval that completed the count. Only postings move
   balances.

A proposal that will never post gets a `proposal_closed`.

---

## Layouts

### `society_opened` (sequence 1, actor absent)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `name` | text | |
| 2 | `currency` | text | ISO 4217 |
| 3 | `fy_start_month` | int | 1–12; India uses 4 |
| 4 | `approval_limit_minor` | int | The first limit in force. 0 sends everything to the committee |
| 5 | `committee` | list\<text\> | Person ids of the elected founding committee |
| 6 | `roles` | list\<text\> | Same order: `president` `treasurer` `secretary` `member` |

### `key_registered` (actor absent)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `person` | text | Whose key |
| 2 | `alg` | text | `ed25519` |
| 3 | `public_key` | bytes | 32 bytes |

A person's key in force for a signature is the `key_registered` entry named
by that signature's `key_seq`, which MUST be earlier in the chain.

### `proposal` (actor: proposing admin)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `action` | text | `expense` `receipt` `charge` `reversal` `limit_change` `seat_admin` `unseat_admin` `appoint_auditor` |
| 2 | `amount_minor` | int? | Always positive. For `limit_change`, the new limit |
| 3 | `currency` | text? | |
| 4 | `counterparty` | text? | Payee or payer |
| 5 | `category` | text? | `opening` marks a balance or arrears carried over from before the society joined: such a proposal is `committee` tier whatever its amount |
| 6 | `narration` | text | |
| 7 | `business_date` | text | `YYYY-MM-DD`. A reversal's is the day it was proposed: it posts in the current period |
| 8 | `flat_id` | text? | A receipt against a flat's dues, or the one flat a `flat` charge is for |
| 9 | `target_seq` | int? | `reversal`: the posting reversed |
| 10 | `reason` | text? | `reversal`: mandatory |
| 11 | `replacement_amount_minor` | int? | `reversal`: reversal + replacement, posted atomically |
| 12 | `person` | text? | `seat_admin`, `unseat_admin`, `appoint_auditor` |
| 13 | `role` | text? | `seat_admin` |
| 14 | `fy` | text? | `appoint_auditor`: `2025-26` |
| 15 | `flat_set` | text? | `charge`: `all`, `parking` or `flat`. Scopes the remainder counter. `flat` charges the one flat named in `flat_id` the whole amount: `flat_ids` is that flat, `line_amounts` the amount, `remainder_flats` empty |
| 16 | `flat_ids` | list\<text\> | `charge`: flats in registry-ordinal order. Empty otherwise |
| 17 | `line_amounts` | list\<int\> | Same order. A charge reversal stores the original's lines **negated one by one** |
| 18 | `remainder_flats` | list\<text\> | Flats that received the indivisible remainder |
| 19 | `tier` | text | `pair` (treasurer **and** secretary) or `committee` |
| 20 | `required` | int | Approvals needed. Fixed here; never re-read from live M |
| 21 | `seated` | int | M when proposed |
| 22 | `limit_minor` | int | The limit in force when proposed |
| 23 | `limit_seq` | int | The entry that set that limit |

### `approval` (actor: the admin)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `proposal_seq` | int | |
| 2 | `decision` | text | `approve` or `decline` |
| 3 | `role` | text | The admin's seat when cast |
| 4 | `derived` | bool | Seated under the emergency exemption. Excluded from counts on `seat_admin` only |
| 5 | `proposal_hash` | bytes | The proposal's `entry_hash` |
| 6 | `key_seq` | int | The `key_registered` entry |
| 7 | `signature` | bytes | 64 bytes, Ed25519 over the approval message |

### `posting` (actor absent)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `proposal_seq` | int | |
| 2 | `effect` | text | `expense` `receipt` `charge` `reversal` `charge_reversal` `limit` `seat` `unseat` `auditor` |
| 3 | `amount_minor` | int? | **Signed** effect on the balance: receipt +, expense −, a reversal the negation of its target |
| 4 | `currency` | text? | |
| 5 | `limit_minor` | int? | `limit` |
| 6 | `person` | text? | `seat` `unseat` `auditor` |
| 7 | `role` | text? | `seat`; `auditor` for `auditor` |
| 8 | `derived` | bool? | `seat` |

Cash balance is the sum of `amount_minor` over postings with effect
`expense`, `receipt` or `reversal`. `charge` and `charge_reversal` are
receivables, not cash. A reversal + replacement produces two postings for
one proposal: the reversal, then a posting with the original's effect.

### `proposal_closed` (actor absent)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `proposal_seq` | int | |
| 2 | `outcome` | text | `declined` `withdrawn` `superseded` `year_closed` |

### `flag` (actor: the resident's pseudonym)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `scope` | text | `entries` `counterparty` `period` |
| 2 | `target_seqs` | list\<int\> | Ascending, distinct. Empty unless `entries` |
| 3 | `counterparty` | text? | |
| 4 | `period` | text? | `YYYY-MM` or `YYYY-YY` |
| 5 | `text` | text | |

### `flag_note`

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `flag_seq` | int | |
| 2 | `note` | text | `comment` `resolved` `raised_in_error` (actor: the flag's own pseudonym) or `response` (actor: an admin) |
| 3 | `text` | text | |

### `month_signoff` (actor: the president)

| # | Field | Type |
|---|---|---|
| 1 | `month` | text, `YYYY-MM` |
| 2 | `through_seq` | int |
| 3 | `through_hash` | bytes |
| 4 | `note` | text? |
| 5 | `key_seq` | int |
| 6 | `signature` | bytes |

### `year_close` (actor: the auditor)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `fy` | text | |
| 2 | `opinion` | text | `clean` `qualified` `adverse` `disclaimer`, in that order of severity |
| 3 | `statement` | text | Public. No private notes exist |
| 4 | `appointment_seq` | int | The `auditor` posting that appointed this auditor |
| 5 | `through_seq` | int | |
| 6 | `through_hash` | bytes | |
| 7 | `key_seq` | int | |
| 8 | `signature` | bytes | |

---

## Pseudonyms

A resident actor is `r_` followed by the first 16 hex characters of
`SHA-256( field(bytes, society_salt) || field(text, person_id) || field(text, tenure_id) )`,
using the §2 field encoding. The salt is per society, never published or
served. Stable per tenure, so distinct-resident counts work; never derived
from a flat number, phone or email.

---

## Signatures

Ed25519 (RFC 8032), keys server-held (AGENTS.md item 2). The signed message
is a §2 field concatenation; every input is in the chain, so any verifier can
rebuild it.

| Signed by | Message |
|---|---|
| `approval` | `text "clearfunds/approval"` · `text society_id` · `int proposal_seq` · `bytes proposal_hash` · `text decision` · `text actor` |
| `month_signoff` | `text "clearfunds/month-signoff"` · `text society_id` · `text month` · `int through_seq` · `bytes through_hash` · `text actor` |
| `year_close` | `text "clearfunds/year-close"` · `text society_id` · `text fy` · `text opinion` · `bytes SHA-256(UTF-8 statement)` · `int through_seq` · `bytes through_hash` · `text actor` |

A verifier checks: the `key_registered` entry at `key_seq` exists, is
earlier, names the same person as the actor, and the signature verifies over
the rebuilt message.

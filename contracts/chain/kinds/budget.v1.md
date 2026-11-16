# Budget kinds, format_version 1

- **Status:** proposed (#76). Shape and the three open questions agreed on #85; lines moved before the proposal so approvals sign them
- **Extends:** [`../entry-preimage.v1.md`](../entry-preimage.v1.md) §5 and
  [`ledger.v1.md`](ledger.v1.md). Additive: no existing hash changes
- **Producer:** backend (`cf.kinds`) · **Consumer:** frontend verifier (`KINDS`)
- **Test vectors:** [`../vectors/budget-kinds.v1.json`](../vectors/budget-kinds.v1.json) come with the backend PR

A year's budget is set by the committee, through the same approvals as an
approval-limit change, and recorded where it cannot be quietly lowered after
the money is spent. Lowering a budget after the fact is the same bug class as
reading the approval limit live (AGENTS.md item 6): an overrun would read as on
budget at the AGM.

**A budget is not money, and no balance ever sees it.** It posts with effect
`budget`, which carries no amount. The cash balance is defined as the sum of
`expense`, `receipt` and `reversal` postings ([`ledger.v1.md`](ledger.v1.md),
`posting`), so a reader that follows the contract excludes it already, as it
excludes `limit` and `seat`.

---

## The flow

1. Any seat proposes a budget for a financial year. In one transaction the
   server appends **`budget_lines`**, carrying the lines, and then, as the
   **very next entry**, a `proposal` with `action` **`budget`**, `fy` set, and
   `amount_minor`, `currency`, `counterparty`, `category` and `flat_id` all
   null. The tier is always **`committee`** (N-of-M), as for `limit_change`,
   whatever the total.
2. Approvals are ordinary `approval` entries on the proposal.
3. When the count completes, a `posting` with effect **`budget`** is appended
   (`amount_minor` null).

A proposal that never posts gets an ordinary `proposal_closed`.

**Why the lines come first.** An approval signs the proposal's `entry_hash`
(the approval message, `proposal_hash`). A proposal's preimage carries its
`prev_hash`, so with `budget_lines` immediately before it, the proposal's hash
covers the lines' hash, and every signed approval commits to the amounts the
approver saw. Lines appended *after* the proposal would sit outside every
signature: an operator could rewrite them and re-chain without one signature
failing, which is the "quietly lowered" attack this kind exists to stop.

These add one value to `proposal.action` (`budget`) and one to
`posting.effect` (`budget`). Neither adds a field to an existing layout, so no
existing entry rehashes (AGENTS.md item 15: link through new kinds, never by
widening old ones).

### `budget_lines` (actor: the proposing admin)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `fy` | text | The financial year, as `2025-26`. Equal to the next entry's `fy` |
| 2 | `currency` | text | The society's currency |
| 3 | `categories` | list\<text\> | Expense categories, distinct, in ascending byte order of their UTF-8 |
| 4 | `amounts_minor` | list\<int\> | Same order. Each ≥ 0, in minor units of `currency` |
| 5 | `income_categories` | list\<text\> | Income categories, same rule. Empty if none are budgeted |
| 6 | `income_amounts_minor` | list\<int\> | Same order. Each ≥ 0 |

A verifier checks that every `budget_lines` at sequence *n* is followed by a
`proposal` with `action` `budget` at *n* + 1 with the same `fy` and actor, that
every `budget` proposal is preceded by one, that each pair of lists is the same
length, and that `categories` and `income_categories` are each strictly
ascending. The proposal itself names no sequence: adjacency is the link, and
the proposal's `prev_hash` is the lines' `entry_hash`.

Income is in the layout from the start, because a field added to this kind later
would rehash every entry of it (AGENTS.md item 15). A budget with no income lines
is valid: its two lists are empty, not absent.

---

## Order of rollout

The frontend's proposal row parser holds `action` as a closed set, and parses
the `proposals` view a page at a time, so one `budget` row it does not know
fails the whole approvals list. The `ledger` view is safe without a change: it
selects five money effects by name and never sends a `budget` posting.

So **the parser learns `budget` first**, and no `budget` proposal is created
(on any server, demo seed included) until that is deployed. The migration
itself can go first: it creates no rows.

## Rules

- **A year can be re-budgeted, and every revision stays.** A later `budget`
  posting for the same `fy` replaces the earlier one as the budget in force.
  Both remain in the chain and in the report.
- **No budget for a year that an auditor has closed.** The proposal is
  refused once a `year_close` exists for that `fy`, and a proposal still open
  when the year closes is closed `year_closed` instead of posting.
- **The report shows the budget as it moved, not only as it ended:**
  - the first budget posted for the year;
  - the one in force at the year's end;
  - every revision in between, with its posting sequence and date;
  - any revision posted after the year ended, marked as such.
- **Categories match exactly.** Actual spend for a category is exactly the
  figure `api_report` already gives on its expenditure line for that category:
  ledger rows with `origin_effect` `expense` (so reversals net against what
  they reverse) and `business_date` in the year, grouped by the proposal's
  `category` byte for byte. Spend in a category with no budget line is listed
  as **unbudgeted**, never dropped.
- **Income is budgeted the same way.** Actual income for a category is the
  figure `api_report` gives on its income line for that category. An AGM needs
  it to ask whether the society planned to collect enough to cover the spending:
  an expenditure-only report shows a shortfall as a clean variance on every line.
- **Variance is computed on the server** (AGENTS.md item 3), as a signed integer:
  `variance_minor = actual_minor - final_minor`. Positive means more than
  budgeted on either side, so an overspend on an expenditure line and a surplus
  on an income line are both positive, and the report says which in words. **No
  percentage:** a category with no budget line has no denominator.

## API

| Change | Shape |
|---|---|
| `/propose` with `proposal.action = "budget"` | `{ action, fy, narration, lines: [{ category, amount_minor }], income_lines: [{ category, amount_minor }] }`. The server trims and sorts each list, and refuses an empty or duplicate category, a category over 80 characters, an amount that is not a whole number from 0 to 2^53 − 1, more than 200 lines in a list, and a budget with no lines at all. It appends `budget_lines` then `proposal` |
| `proposals` view | Two new columns, `lines` and `income_lines`: `[{ category, amount_minor }]` in the chained order for a `budget` proposal, `null` for every other action |
| `api_report(p_society, p_fy)` | Adds `budget`, `null` for a year with no budget posted. Otherwise `{ first_seq, final_seq, revisions, expenditure, income, unbudgeted_expenditure, unbudgeted_income }` |

- `first_seq`, `final_seq`: the posting sequences of the first and the last
  `budget` posting for the year (equal when it was never revised).
- `revisions`: every `budget` posting for the year, oldest first, as
  `{ posting_seq, proposal_seq, recorded_at, after_year_end }`. `after_year_end`
  is true when it was chained after the year's last day (Asia/Kolkata).
- `expenditure`, `income`: one `line` per category in the first **or** the
  final budget, in ascending byte order: `{ category, first_minor, final_minor,
  actual_minor, variance_minor }`.
  - `first_minor` is `null` when the first budget had no line for it, and
    `final_minor` is `null` when the final budget has none: a line added or
    dropped by a revision, never a zero standing in for "not budgeted".
  - `actual_minor` is the figure on `api_report`'s own income or expenditure
    line for that category, `0` when there is none.
  - `variance_minor = actual_minor - final_minor`, `null` when `final_minor` is.
- `unbudgeted_expenditure`, `unbudgeted_income`: `{ category, actual_minor }`
  for each category with actual figures and no line in the first or final
  budget. Never dropped.

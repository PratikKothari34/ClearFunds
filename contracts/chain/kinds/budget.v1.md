# Budget kinds, format_version 1

- **Status:** proposed (#76). Shape and the three open questions agreed on #85
- **Extends:** [`../entry-preimage.v1.md`](../entry-preimage.v1.md) §5 and
  [`ledger.v1.md`](ledger.v1.md). Additive: no existing hash changes
- **Producer:** backend (`cf.kinds`) · **Consumer:** frontend verifier (`KINDS`)
- **Test vectors:** [`../vectors/budget-kinds.v1.json`](../vectors/budget-kinds.v1.json) follow with the backend PR

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

1. Any seat proposes with `action` **`budget`**, `fy` set, and
   `amount_minor`, `counterparty`, `category` and `flat_id` all null. The
   tier is always **`committee`** (N-of-M), as for `limit_change`, whatever
   the total.
2. In the same transaction the server appends **`budget_lines`**, the next
   entry after the proposal, carrying the lines.
3. Approvals are ordinary `approval` entries on the proposal.
4. When the count completes, a `posting` with effect **`budget`** is appended
   (`amount_minor` null).

A proposal that never posts gets an ordinary `proposal_closed`.

These add one value to `proposal.action` (`budget`) and one to
`posting.effect` (`budget`). Neither adds a field to an existing layout, so no
existing entry rehashes (AGENTS.md item 15: link through new kinds, never by
widening old ones).

### `budget_lines` (actor: the proposing admin)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `proposal_seq` | int | The `budget` proposal. Always the entry immediately before this one |
| 2 | `currency` | text | The society's currency |
| 3 | `categories` | list\<text\> | Expense categories, distinct, in ascending byte order of their UTF-8 |
| 4 | `amounts_minor` | list\<int\> | Same order. Each ≥ 0, in minor units of `currency` |
| 5 | `income_categories` | list\<text\> | Income categories, same rule. Empty if none are budgeted |
| 6 | `income_amounts_minor` | list\<int\> | Same order. Each ≥ 0 |

A verifier checks that entry `proposal_seq` is a `proposal` with `action`
`budget`, that it is the immediately preceding sequence, that each pair of lists
is the same length, and that `categories` and `income_categories` are each
strictly ascending.

Income is in the layout from the start, because a field added to this kind later
would rehash every entry of it (AGENTS.md item 15). A budget with no income lines
is valid: its two lists are empty, not absent.

---

## Rules

- **A year can be re-budgeted, and every revision stays.** A later `budget`
  posting for the same `fy` replaces the earlier one as the budget in force.
  Both remain in the chain and in the report.
- **No budget proposal for a year that an auditor has closed.** The proposal
  is refused once a `year_close` exists for that `fy`.
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

## API (sketch, for agreement)

| Change | Shape |
|---|---|
| `/propose` with `proposal.action = "budget"` | `{ fy, narration, lines: [{ category, amount_minor }], income_lines: [{ category, amount_minor }] }`. The server sorts each list, refuses duplicate or empty categories and negative amounts, and appends `proposal` then `budget_lines`. At least one line in total |
| `proposals` view | A `budget` proposal carries `lines` and `income_lines` beside the usual approval fields |
| `api_report(p_society, p_fy)` | Adds `budget: { first_seq, final_seq, revisions: [{ posting_seq, posted_at, after_year_end }], expenditure: [line], income: [line], unbudgeted_expenditure: [{ category, actual_minor }], unbudgeted_income: [{ category, actual_minor }] }`, where `line` is `{ category, first_minor, final_minor, actual_minor, variance_minor }`. `budget` is `null` for a year with no budget |

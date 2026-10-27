# Payment-claim kinds, format_version 1

- **Status:** proposed (#12)
- **Extends:** [`../entry-preimage.v1.md`](../entry-preimage.v1.md) §5. Additive: no
  existing hash changes.
- **Producer:** backend (`cf.kinds`) · **Consumer:** frontend verifier (`KINDS`)
- **Test vectors:** [`../vectors/claims-kinds.v1.json`](../vectors/claims-kinds.v1.json)

A resident's "I've paid" claim is chained when it is made, so a payment the
committee ignores or drops stays on the record. It becomes money only through
an ordinary `receipt` proposal approved under AGENTS.md item 6.

---

### `payment_claim` (actor: absent)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `flat_id` | text | The flat the payment is for |
| 2 | `amount_minor` | int | Positive, minor units |
| 3 | `currency` | text | The society's currency |
| 4 | `paid_on` | text | `YYYY-MM-DD`, not in the future |
| 5 | `method` | text | `upi` or `bank_transfer`. Cash is not accepted |
| 6 | `reference` | text | The UTR or transaction reference, 6–30 of `[A-Za-z0-9]` |

**The actor is absent, and no field names the claimant.** The flat is public
on receipts already; a resident's pseudonym beside a flat id would map that
pseudonym to a flat and unmask every flag it raised (AGENTS.md item 14). Who
claimed is held server-side only.

### `claim_closed`

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `claim_seq` | int | The `payment_claim` |
| 2 | `outcome` | text | `receipted` or `rejected` |
| 3 | `proposal_seq` | int? | `receipted`: the receipt proposal that posted |
| 4 | `reason` | text? | `rejected`: mandatory, at most 500 characters |

- **`receipted`**: actor absent, appended in the same transaction as the
  receipt's `posting`.
- **`rejected`**: actor is the reviewing committee member's person id. A
  rejection moves no money, and it names who made it.

A claim is closed at most once. A receipt proposal that is declined, withdrawn
or closed by a year close leaves its claim open again; nothing is chained for
that, because the proposal's own `proposal_closed` already records it.

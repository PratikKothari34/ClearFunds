# Society kinds, format_version 1

- **Status:** proposed (#10)
- **Extends:** [`../entry-preimage.v1.md`](../entry-preimage.v1.md) §5. Additive: no
  existing hash changes.
- **Producer:** backend (`cf.kinds`) · **Consumer:** frontend verifier (`KINDS`)
- **Test vectors:** [`../vectors/society-kinds.v1.json`](../vectors/society-kinds.v1.json)

Two kinds written when a society opens and when its task assignments change.
Encoding rules are those of [`ledger.v1.md`](ledger.v1.md): `T?` is encoded as
absent (`0x00`) when null and is always present in the sequence. An actor that
is a person is that person's id as text.

---

## Order at open

"Open the ledger" (`api/v1.md`, *Society setup*) appends, in one transaction:

1. `society_opened` (sequence 1), as in `ledger.v1.md`
2. `document_attached` with `purpose` `election_minutes` (sequence 2)
3. one `tasks_set` per post, in the order the posts were defined in setup

A chain whose sequence 2 is not a `document_attached` with `purpose`
`election_minutes` was not opened under this contract. A verifier reports it,
not passes it.

---

### `document_attached` (actor: the president)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `purpose` | text | `election_minutes`. Later contracts may add values |
| 2 | `file_name` | text | As uploaded, NFC, at most 200 characters |
| 3 | `media_type` | text | `application/pdf` |
| 4 | `size_bytes` | int | Exact size of the stored object |
| 5 | `sha256` | bytes | 32 bytes. SHA-256 of the stored object's exact bytes, computed by the server from storage, never taken from the client |

At most one `election_minutes` entry per chain.

### `tasks_set` (actor: the president, or absent)

The full state of one post. The latest `tasks_set` for a `post_id` is the one
in force; there is no partial update.

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `post_id` | text | `pst_` + 8 of `[a-z0-9]`. Stable for the life of the post |
| 2 | `post_title` | text | Display title, NFC, 1–60 characters |
| 3 | `seat_role` | text | `president` `treasurer` `secretary` `member` |
| 4 | `holder` | text? | Person id holding the post; null when vacant |
| 5 | `tasks` | list\<text\> | Distinct, ascending by UTF-8 bytes, each from the catalogue below. Empty when the post has none |

- **Fixed posts** (`president`, `treasurer`, `secretary`): exactly one post per
  role, and `holder` must be the person seated in that role. Every other post
  has `seat_role` `member` and a `holder`, if any, who holds a `member` seat.
- **Actor absent** only when the server records a holder change caused by a
  `seat` or `unseat` posting, appended in the same transaction as that
  posting. Every other `tasks_set` is the president's.
- A title, a holder or a task list changes only by a new `tasks_set`. The
  projection that enforces tasks is rebuilt from these entries.

### Task catalogue

A task lets its holder start or prepare work. **No task completes a money
movement**: approvals stay as `AGENTS.md` item 6 fixes them, whoever proposed.

| Task | Unlocks |
|---|---|
| `manage_residents` | Add people, flats and tenures; close tenures |
| `propose_expenses` | Propose `expense` |
| `raise_monthly_charges` | Propose `charge` |
| `respond_to_flags` | Append a `flag_note` with `note` `response` |
| `review_payment_claims` | Reserved for the payment-claims contract (#12) |
| `send_dues_reminders` | Trigger dues reminders |

Unknown task names are refused. Adding a task is an additive contract change;
removing or renaming one is not, since old entries carry the name.

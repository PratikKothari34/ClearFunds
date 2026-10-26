# AGENTS.md

Orientation for an AI agent working in this repository. Read this first, then
the files below.

## What this project is

**ClearFunds** is a web app that keeps an **append-only, tamper-evident expense
ledger for housing-society funds.**

Multiple admins — treasurer, secretary, president, committee members — log in
and approve entries. **No single admin can alter an entry on their own.** The
president has the final say on each month's expense sheet; an auditor, a role
distinct from both admin and resident, is the only one who can close a
financial year. Residents get read-only access to the full transaction
history with a running balance.

Built for residential housing societies of roughly 80–150 flats, in India. The
domain vocabulary is specific: monthly maintenance dues per flat, UPI and bank
transfers, an annual general meeting (AGM), and a financial audit the society
is legally required to undergo each year.

## Read this to understand the project

**[`docs/GOALS.md`](docs/GOALS.md) — start here. Read it in full before
writing any code.**

It is the authoritative statement of what the product is for: who uses it, the
problem it replaces, the jobs it must do, the five mechanisms that make the
ledger trustworthy, the full feature set, and — most importantly — the **open
questions** that are not yet decided.

Then:

- **[`docs/decisions/README.md`](docs/decisions/README.md)** — the decision log
  format, and the rule for when a decision earns an entry. Read it before
  recording a decision.
- **`CONTRIBUTING.md`** at the root — the branch, review, label and commit
  conventions, and the definition of done for each lane. Read it before
  opening a PR.
- **`frontend/README.md`** — how to install, run, test and build the
  frontend. Each lane documents its own stack, so this is the file to read
  before running anything in `frontend/`. There is **no root `README.md`
  yet**: by `CONTRIBUTING.md` it is created once both stacks run, and it will
  hold repository-wide setup and link to the two lane READMEs. Until then its
  absence is deliberate, not an omission to fix.

**The frontend exists and runs.** `frontend/` holds a React 19 + TypeScript
SPA on Vite. The backend does not exist yet.

## Who builds what

Work is split by person, not by ticket:

- **Backend is `tadiPro250`'s.** Schema, migrations, server routes, the API
  implementation, signing and chain verification on the server side.
- **Frontend is `PratikKothari34`'s.**

Directory ownership follows the split: `frontend/` is Pratik's, `backend/` is
Prem's, and `contracts/`, `docs/` and the root files are shared. The full
table is in [`CONTRIBUTING.md`](CONTRIBUTING.md) §1.1.

Stay in your lane. If your side needs something from the other, **state the
contract you need** — endpoint, payload shape, error cases — and raise it,
rather than implementing the other half to unblock yourself. Two
implementations of the same boundary is worse than a blocked branch.

**Backend work starts from a GitHub issue, not from this file.** Reading the
repository is not an assignment. If there is no open issue assigned to you,
there is nothing to build — ask for one rather than picking a starting point.
Each issue carries its own scope and the contract the frontend expects;
anything outside that scope is a separate issue.

**The frontend is built; the backend has not started.** The frontend is
React 19 + TypeScript on Vite, deployed as a static SPA, with TanStack Router
(route-level code splitting), TanStack Query, TanStack Virtual for the ledger,
Tailwind v4 reading its theme from CSS tokens, and `react-i18next`
(scaffolded but **English-only** - one locale ships, and the library is loaded
lazily so the default payload never carries it). It holds
no signing keys, renders no reports, and performs no money arithmetic — see
the settled items in the next section.

It currently reads sample data from one module; every place a server payload
belongs is marked there, and the per-band `failed` props are where each
query's error state wires in.
**The backend stack is `tadiPro250`'s to choose**, constrained only by the
contract those items describe.

## Before you change anything

**Read `docs/GOALS.md` → "Open questions" first.** The decisions that would
block implementation are settled; what remains open is listed there, and none
of it blocks a first schema.

Settled, and binding on backend work:

1. **"Tamper-evident" is not "tamper-proof."** Hash-chaining makes tampering
   *detectable*, not *impossible* — whoever controls the database can recompute
   the entire chain. Do not write documentation, UI copy, or comments claiming
   the ledger is immutable or tamper-proof. The accurate word is
   **tamper-evident**, and the research uses it deliberately.

2. **Signing keys are server-held, and that makes the published chain head a
   requirement.** The server signs on an authenticated admin's behalf; no key
   material reaches the client. Because the operator could therefore mint an
   approval, the design depends on **publishing the chain head outside admin
   control** on a recurring schedule, to recipients who keep their own copies.
   Hash-chaining inside a database the admins control detects nothing an admin
   with database access cannot repair. Treat the published head as part of the
   feature, not a later addition — shipping the chain without it makes the
   product's central claim untrue. Mechanism and cadence are still open.

3. **Reports are generated server-side from signed data.** An audit report
   re-derived in the client can be altered before it is read. **Reversed
   entries always appear in reports** — omitting them conceals what the chain
   exists to prove.

4. **Money is an integer count of the currency's minor units, with an explicit
   ISO 4217 currency code.** ₹1,250.75 is `125075`, stored next to `"INR"`.
   **No floating-point currency at any layer** — the errors surface at
   reconciliation and the fix means rewriting the chain. Carry the `currency`
   column from the first schema even though it is always `INR` today: INR is
   the only currency now and others are future scope, but backfilling that
   column later would touch hash-chained rows. The unit is *minor units of the
   stated currency*, never a hardcoded ÷100 — JPY has 0 decimal places and KWD
   has 3. The API contract is integer minor units regardless of the database
   column type. **Rounding is half-up to the minor unit** (settled
   2026-10-22, and stated again under point 10); apply it explicitly
   server-side rather than inheriting a language default.

5. **Corrections are new entries; nothing is ever edited or deleted.** A
   correction references the entry it corrects, carries a **mandatory reason**,
   and leaves the original visible and marked reversed. **No edit, delete,
   void-in-place or soft-delete path on ledger entries** — mutating an entry
   breaks its hash. Three operations: **reversal** (cancels), **reversal +
   replacement** (cancels and posts the corrected amount atomically), and
   **flag** (any resident marks an entry disputed, **no financial effect** —
   residents raise disputes, they do not move money). Enforce server-side:
   **an entry can be reversed at most once**, and **a reversal cannot itself be
   reversed**. **"At most once" counts *posted* reversals** — an abandoned or
   deadlocked in-flight reversal must not consume the entry's one chance, or two
   admins resigning mid-approval can permanently protect a fraudulent entry.
   Compute balances so reversed pairs net to zero by construction rather than by
   special-casing. **A reversal negates the original's stored per-flat rows line
   by line; it never recomputes the allocation.** Recomputing on a negated total
   leaves a 1-minor-unit residue on roughly two thirds of flats while the total
   still nets to zero — nothing alarms, and every affected resident's own figure
   is permanently wrong.

6. **Approval is tiered by amount.** The committee sets a single rupee limit.
   **At or below it, a transaction needs the treasurer *and* the secretary —
   both, never either alone.** **Above it, and to set or change the limit
   itself, it needs N-of-M.** A limit of **zero** makes every entry N-of-M and
   is the safe default for a society that has not set one.

   **The tier never reduces to a single approver.** The invariant is that no
   one admin moves the ledger alone; the tier trades 9-of-13 for 2-of-2, never
   for 1. **Treasurer-alone below the limit is rejected at any limit** — a
   daily below-limit allowance extracts an unbounded sum given time.

   **The limit in force must be recorded in the chain**, set at the N-of-M
   threshold, so an approval is checkable against the limit that applied when
   it was cast. **Reading the limit from live config is a correctness bug**: a
   committee lowers it afterwards and retroactively legitimises a below-limit
   approval. Same bug class as reading M live, below.

   **Structuring is the attack this invites** — splitting one large spend into
   below-limit pieces. It cannot be blocked at the threshold, because each
   piece is genuinely below the limit with two valid approvals. **Make it
   visible instead:** below-limit entries to the same payee crossing the limit
   within a rolling window render as **one aggregate marked as having
   crossed**, with its constituents listed, and that aggregate appears in the
   AGM report. **Do not block the next entry** — it punishes a genuine run of
   small repairs and teaches splitting across payees, which is harder to see.
   Window length and whether it keys on payee, category or both is open.

   **Above the limit, approval requires at least two-thirds of admins, rounded
   up** — `ceil(2 × M / 3)`, so 4 of 5 and 5 of 7, never 3 of 5. **This is a
   hard floor enforced in code, not a default in a settings table.** A society
   may configure a higher threshold; **it must never be able to configure a
   lower one.** **A reversal requires at least the tier of the entry it
   reverses** — easier reversal than origination makes the tier a laundering
   path: post below the limit, reverse below the limit, repeat.

   **The required count is snapshotted on the approval record when the first
   approval is cast, and may only ever increase.** Reading M live is a
   correctness bug, not a simplification: three approvals collected under M=5
   (threshold 4) become retroactively sufficient the moment an admin resigns and
   M=4 lowers the threshold to 3. No attacker is needed — ordinary mid-approval
   turnover does it. **Do not instead invalidate in-flight approvals when M
   changes**: that hands the committee a cancel button (approve a reversal,
   accept a resignation, the approvals die, repeat at no cost) and requires
   voiding a signed chained approval in place, which item 5 forbids.

   **Default the admin count to the society's statutory committee strength.**
   Maharashtra model bye-law 113 sets the managing committee at **11 members
   for up to 100 flats and 13 for 101-200** — the whole band this product
   targets — so do not build a UI that recommends four or five admins. **M>=3
   is a floor, not advice:** the reason for the floor is that escalation needs
   a recipient who is not the accused, impossible at M=2 — *not* that 3 is
   safer to approve with. It is not: 2-of-3 collusion needs 67% of the
   committee against 75% at M=4 and 80% at M=5. Two results worth knowing
   before you tune anything: **M=13 needs a lower collusion share (69.2%) than
   M=5 (80%)**, so bigger is not monotonically safer under `ceil(2M/3)`; and
   seating one more admin leaves the threshold **unchanged** at M=11->12,
   M=8->9 and M=5->6. A 3-admin society may configure its threshold to 3 and
   get unanimity back.

   **A derived admin's vote does not count toward seating further admins.**
   The snapshot threshold defends against resignations but not against
   additions. Once an attacker holds the threshold at M=3, every further
   appointment is **self-financing**: seating an ally adds +1 to votes held and
   +0 or +1 to the threshold, so the margin runs +0,+0,+0,+1,+1,+1,+2,... and
   never goes negative. One threshold-free appointment is therefore enough to
   reach an admin set fully disjoint from the original, for the price of a few
   resignation letters. So: an admin seated under the low-admin exemption, or
   seated by a voting set containing a derived admin, is flagged **derived** in
   the chain, and its vote is excluded **only** from seating further admins —
   it counts normally for reversals, closing a year and ordinary approvals.
   Derived status clears by a vote of non-derived admins meeting the threshold,
   or at the next statutory election. **The exemption itself applies only at
   M<=1**, because at M=2 the threshold is already 2 and two non-derived admins
   can seat a replacement under the normal rule.

7. **An entry in a closed financial year cannot be reversed in that year.**
   The reversal posts in the **current** period as an adjusting entry
   referencing the original across the year boundary, leaving the closed year's
   filed figures intact — reversing inside an audited period invalidates a
   filed audit report. Any per-period total must therefore be computed from
   entries **posted** in that period, never from the entries a reversal points
   at.

8. **"Closed" means an auditor has signed off — not an admin action, and not a
   date rolling over.** The committee cannot close its own books, for the same
   reason it cannot approve an entry alone. This implies **an auditor role
   distinct from admin and resident**, and a year-close record carrying the
   auditor's identity, signature and timestamp. Until that sign-off exists the
   year is open and its entries reverse normally. **A date-based or
   admin-triggered close would let the committee lock its own books, so do not
   implement one as a convenience.**

9. **A hash chain proves a record did not change. It proves nothing about a
   record being absent.** Omission is the attack the chain alone does not see,
   and closing it constrains the schema, so it cannot be retrofitted:

   - **A strictly monotonic sequence number inside the hash preimage**, so gaps
     are structurally visible rather than inferred from a row count.
   - **The published head is a signed tuple, not a bare hash:**
     `(hash, highest_sequence, entry_count, as_of, format_version)`. A client
     holding a head then knows how many entries must exist beneath it.
   - **`format_version` in both the head and the preimage**, so the first
     deliberate preimage change reads as a migration instead of mass tampering.

   **State the limit honestly: this delivers completeness only against a head
   the client did not get from the server.** On a first-ever load the operator
   can serve entries renumbered 1..N under a signed head asserting N —
   contiguous, count-matched, hash-linked, every check passing, with the
   concealed entries and the flags against them simply absent. **So the
   published head must be fetchable by the client directly**, not merely written
   to by the server; a recipient that takes delivery of a head but exposes no
   client-readable endpoint does not close this. Until that anchor exists, any
   "no unresolved disputes" figure detects an operator who edits, not one who
   omits, and must be worded that way.

10. **An allocation is materialised into the chain, never recomputed at read
   time**, and the allocation record stores **both the ordered list of flat ids
   it used and the flats selected for the remainder**, inside the hash preimage.
   Without the stored selection, verifying one allocation means replaying every
   allocation from genesis plus every flat-join event. The storage cost is
   negligible; the alternative is unverifiable by a partial observer.

   **The indivisible remainder goes to the flats with the lowest cumulative
   remainder-received count to date, ties broken by the flat's permanent
   registry ordinal, and the counter is scoped to that allocation's flat-set.**
   Each clause is load-bearing and each was measured: a fixed ascending order
   compounds to a 12-paise annual gap between the first and last flat; one
   global counter across differing flat-sets produces a ~5-paise systematic bias
   that correlates with a visible real-world attribute ("the software charges
   flats without parking more maintenance"), which is worse at an AGM than the
   bias it replaced. **A new flat is seeded at the median cumulative count, not
   zero** — at zero a late joiner takes the remainder in 10 of its first 12
   months against a fair 3. **Do not seed the rotation from the entry's position
   in the chain**: `sequence mod N` changes a past allocation's expected output
   when one flat is added, so the ledger reads as tampered when it is not.
   **Rounding is half-up to the minor unit.**

11. **Auditor sign-off is atomic and carries one of four opinion types** —
   `clean`, `qualified`, `adverse`, `disclaimer`. A qualified or adverse opinion
   **still closes the year**: sealing a year and approving its contents are
   different things, and `disclaimer` is the one a stonewalled auditor actually
   needs.

   **Severity is explicitly ordered: `clean` < `qualified` < `adverse` <
   `disclaimer`.** A **disclaimer is more serious than an adverse opinion** —
   an auditor who was blocked from doing the work is a louder signal than one
   who did it and found the accounts wrong. The year's headline status is
   **the most serious opinion ever received** — never "most adverse", which is
   ambiguous under this ranking — with full history beneath it, **except that an opinion from an auditor
   appointed by a different admin set may govern over an earlier one** — both
   halves are required, since most-adverse-wins alone lets one vindictive
   auditor brand an honest society permanently, while newest-wins alone lets a
   committee bury an adverse opinion under a clean one from an auditor it
   appointed. Superseding **never changes a closed year's figures**. **No private
   auditor notes** — anything the auditor records is public and chained.

   **The auditor gives reasonable assurance, never a guarantee.** He does not
   certify that the books are correct or in order; he expresses reasonable
   assurance that the statements are free of material misstatement, on the
   evidence he examined. Error may remain. **No string in the product may say
   the auditor certified, verified or confirmed that the accounts are
   correct** — same force as *tamper-evident, never tamper-proof*.

   **The report's body is the balance sheet and the profit and loss account**,
   both generated server-side from chained entries, both carrying the **true
   and fair view** wording. They are the report, not attachments to it.

   **An adjusting entry against a closed year must be disclosed at the AGM.**
   Sitting in the current year's ledger does not discharge it. The report
   carries a **generated** section naming each one, the year it corrects, the
   amount and the mandatory reason — generated, so whoever prepares the report
   cannot omit it.

   **Flags are append-only like everything else: nothing is ever withdrawn or
   hidden.** A resident may append "raised in error" or "resolved to my
   satisfaction"; admins may only append a response. **Only the flagging
   resident can mark a flag resolved**, which removes any point in pressuring
   them, since deletion does not exist. **An admin response does not pause the
   escalation clock** — otherwise "we replied" is a reset button. At most one
   open flag per resident per entry, with the headline figure counting
   **distinct flagging residents** rather than flags; and **a flag must be able
   to cover a vendor, a period or a set of entries as one dispute**, because a
   per-entry limit otherwise constrains the victim and not the attacker — a sum
   posted as 40 small entries forces one resident to file 40 flags.

   **The preimage carries a salted pseudonym, never a resident identifier.**
   Residents are anonymous to each other while the treasurer, secretary and
   admin can resolve them, and a flag's author sits in the hash preimage — which
   every resident can recompute. **A bare hash of a flat number, phone or email
   does not satisfy this**: the resident universe is only 80–150, so an
   exhaustive table unmasks an author in milliseconds, and a neighbour already
   knows the society's phone list. Commit `H(society_salt || resident_id)` with
   a **secret per-society salt that is never published or served**, and resolve
   to a person server-side for the three privileged roles only. The pseudonym
   must be **stable per resident**, because that is what makes the
   distinct-flagging-resident count above computable; **per-flag nonces are
   forbidden** — they would break that count.

   **Identity follows the person, not the flat, and is scoped to an
   occupancy.** The committed handle is
   `H(society_salt || person_id || tenure_id)`. On a sale the buyer gets their
   own account and read access to the full history; the seller keeps their own
   pseudonym and their past flags stay attributed to them. **Do not implement
   one account per flat handed over at sale**, however often it is requested:
   the buyer would inherit the seller's pseudonym and **every dispute the seller
   ever filed would read as the buyer's**, which makes the record lie. Nothing
   in a preimage is ever rewritten to accommodate a sale.

   **This needs an occupancy record — `(flat, person, start, end)` — and it is
   the authority for access.** Access derives from an **open tenure**, never
   from a stored permission flag, or the two drift apart. Revoking is **closing
   a tenure, not deleting an account**, and **a tenure is never deleted**
   because past flags depend on its handle. **Tenures must be allowed to
   overlap**: joint owners hold one flat simultaneously, and a buyer may occupy
   before the sale completes, so a schema enforcing one open tenure per flat is
   wrong. Exactly one tenure per *person* is active at a time, which is what
   keeps the distinct-resident counts above correct.

   **Tenants are sub-accounts under the owner, with their own handle.** A
   tenant holds **their own tenure** and therefore their own
   `H(society_salt || person_id || tenure_id)`; the owner-tenant link is a
   **server-side relation and must never enter a preimage**. **Do not give the
   tenant the owner's handle** — a flag the tenant raised would be attributed
   to the owner, which makes the record lie, and the pair would count as one
   complainant, breaking the distinct-resident figures above.

   **The owner may see what their own tenant raised — and nothing more.** This
   is a **fourth** visibility rule: residents are otherwise anonymous to each
   other, and only treasurer, secretary and admin resolve identity. Scope it to
   **that owner's own tenant**, never to flags generally. The owner **may not**
   withdraw, edit or resolve the tenant's flag (append-only; only the flagging
   resident resolves their own), **may not** see any other resident's identity,
   and the tenant's handle **must not** appear on a shared or public surface.
   **The tenant must be told that their owner can see this**, at enrolment and
   on the flag surface — an anonymity promise that silently excludes the
   landlord is a false one.

   **Lifecycle:** a tenant tenure closes **independently** of the owner's, and
   **closing an owner tenure must cascade** to its dependent tenant tenures, or
   a tenant keeps access under a landlord who no longer owns the flat.

   **A mismatch report is its own object, not a flag.** A flag attaches to one
   entry; a chain-fingerprint mismatch concerns the whole ledger. At most one
   open report per resident, updated rather than duplicated, so the displayed
   figure counts distinct residents.

If your work requires one of the unsettled decisions resolved, say so and ask
rather than picking a default.

## Conventions

- **Decisions go in `docs/decisions/`**, one file per entry,
  `NNNN-kebab-title.md`, numbered in order. Only load-bearing choices earn an
  entry — ones where reversing later would cost real rework. Format is in that
  directory's `README.md`.
- **How work moves is in [`CONTRIBUTING.md`](CONTRIBUTING.md): lanes and
  directory ownership, issues, branches, PRs and contracts.** In short:
  every change starts from an issue in your lane; branch
  `<area>/<issue>-<slug>` and open the PR, squash-merged after the other
  person approves. Nobody merges without the other person's approval, and
  pushing new commits dismisses existing approvals, so push before asking for
  review, not after.
  **Target your PR at `main`:** there is no `dev` branch today. The `dev` and
  promote-PR model in `CONTRIBUTING.md` §3 is the target, not the live
  setup — that file's own table marks which rules are live, and it is the
  authority if this summary ever drifts from it.
- **No `Co-authored-by` trailer on commits**, and no agent attribution of any
  kind in a commit message or PR description. Some coding agents append one
  automatically; strip it before committing. GitHub parses that trailer and
  credits the named account as a repository contributor, which misstates
  authorship — and removing it afterwards means rewriting pushed history, which
  `main` forbids. Also keep absolute paths from your own machine out of commit
  messages.
- **Line endings** are normalized by `.gitattributes`: LF everywhere, CRLF for
  `.ps1`, `.cmd`, and `.bat`. Do not override it.
- **Licensing: GPL-3.0** (`LICENSE`, verbatim and not to be edited).
  Copyright holders are listed in `COPYRIGHT`; add a contributor there rather
  than altering `LICENSE`, which would break automated license detection.
- **Never commit secrets**, `.env` files, or build output. `.gitignore` covers
  the common cases, but it is not a safety net you should lean on. **This
  repository is public** — a pushed secret is public permanently, and deleting
  it in a later commit does not remove it from the history.
- **Money is not a float.** Amounts are an integer count of the currency's
  minor units, beside an explicit ISO 4217 `currency` code. This is settled,
  not an open question: carry `currency` from the first schema even though it
  is always `INR` today, because backfilling that column later would touch
  hash-chained rows. Binary floating point is not permitted at any layer.
- Some paths in `.gitignore` are intentionally local to a working copy and will
  not be present in your clone. Their absence is not a missing file, and
  nothing you write should depend on one.

## A note on the domain

This software records other people's money, and the people operating it are
volunteers, not finance professionals. Two consequences worth holding onto:

**Correctness outranks convenience.** A ledger that is approximately right is
worse than useless — it is misleading in a context where the whole point is
proving nothing was hidden.

**The security model only works if people can actually use it.** N-of-M
approval and per-action signatures are being delivered to volunteers on phones.
If signing is burdensome, admins will share credentials — and shared
credentials collapse N-of-M approval back into the single-person control the
product exists to prevent. A security measure that gets worked around has made
things worse, not better.

This is why keys are server-held rather than device-held: device keys would
stop even the operator forging an approval, but losing a phone would cost an
admin their ability to approve, and every workable recovery story reintroduces
a shared secret. The trade was made deliberately, and the published chain head
is what bounds it. Do not reopen it by adding client-side key generation.

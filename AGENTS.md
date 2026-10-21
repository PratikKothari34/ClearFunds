# AGENTS.md

Orientation for an AI agent working in this repository. Read this first, then
the files below.

## What this project is

**ClearFunds** is a web app that keeps an **append-only, tamper-evident expense
ledger for housing-society funds.**

Multiple admins — treasurer, secretary, committee members — log in and approve
entries. **No single admin can alter an entry on their own.** Residents get
read-only access to the full transaction history with a running balance.

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
- **`README.md`** at the root — **does not exist yet.** There is nothing to
  set up or run, so nothing to document. When a stack is chosen it gets
  written; until then its absence is accurate, not an oversight.

There is no source tree yet. This repository currently holds scaffolding and
design documentation only.

## Who builds what

Work is split by person, not by ticket:

- **Backend is `tadiPro250`'s.** Schema, migrations, server routes, the API
  implementation, signing and chain verification on the server side.
- **Frontend is `PratikKothari34`'s.**

Stay in your lane. If your side needs something from the other, **state the
contract you need** — endpoint, payload shape, error cases — and raise it,
rather than implementing the other half to unblock yourself. Two
implementations of the same boundary is worse than a blocked branch.

**Backend work starts from a GitHub issue, not from this file.** Reading the
repository is not an assignment. If there is no open issue assigned to you,
there is nothing to build — ask for one rather than picking a starting point.
Each issue carries its own scope and the contract the frontend expects;
anything outside that scope is a separate issue.

**The frontend stack is decided; no implementation has started on either
side.** The frontend is React + TypeScript on Vite, deployed as a static SPA,
with TanStack Router and Query. It holds no signing keys, renders no reports,
and performs no money arithmetic — see the settled items in the next section.
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
   column type. **Rounding policy for computed amounts is still open**; decide
   it explicitly server-side rather than inheriting a language default.

5. **Corrections are new entries; nothing is ever edited or deleted.** A
   correction references the entry it corrects, carries a **mandatory reason**,
   and leaves the original visible and marked reversed. **No edit, delete,
   void-in-place or soft-delete path on ledger entries** — mutating an entry
   breaks its hash. Three operations: **reversal** (cancels), **reversal +
   replacement** (cancels and posts the corrected amount atomically), and
   **flag** (any resident marks an entry disputed, **no financial effect** —
   residents raise disputes, they do not move money). Enforce server-side:
   **an entry can be reversed at most once**, and **a reversal cannot itself be
   reversed**. Compute balances so reversed pairs net to zero by construction
   rather than by special-casing.

6. **Approval requires at least two-thirds of admins, rounded up** —
   `ceil(2 × M / 3)`, so 4 of 5 and 5 of 7, never 3 of 5. **This is a hard
   floor enforced in code, not a default in a settings table.** A society may
   configure a higher threshold; **it must never be able to configure a lower
   one.** Reversals require the same threshold as the original entry.

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

If your work requires one of the unsettled decisions resolved, say so and ask
rather than picking a default.

## Conventions

- **Decisions go in `docs/decisions/`**, one file per entry,
  `NNNN-kebab-title.md`, numbered in order. Only load-bearing choices earn an
  entry — ones where reversing later would cost real rework. Format is in that
  directory's `README.md`.
- **`main` is protected. Open a pull request; do not push to it.** Direct
  pushes are rejected. Also enforced: linear history (merge commits are
  refused, so rebase rather than merge `main` into your branch), one approving
  review, and every review thread resolved before merge. Pushing new commits
  dismisses existing approvals, so push before asking for review, not after.
  Merges are squash or rebase only.
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
- **Money is not a float.** When the schema arrives, amounts are stored as
  integer minor units or an exact decimal type. This is listed under the open
  questions because it is unsettled, but no reading of it permits binary
  floating point in a ledger.
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

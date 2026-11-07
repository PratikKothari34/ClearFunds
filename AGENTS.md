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
  before running anything in `frontend/`. The root
  [`README.md`](README.md) covers what the product is and how the two lanes
  fit together, and links to both lane READMEs.

**Both stacks exist and run.** `frontend/` holds a React 19 + TypeScript SPA
on Vite. `backend/` holds the Supabase stack — 21 migrations under
`backend/supabase/migrations/`, one edge function at
`backend/supabase/functions/api/`, and a local seed script. Run the backend
with `supabase start`; the seed targets the local API only.

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

**Both stacks are built; what is not finished is the boundary between
them.** The frontend is
React 19 + TypeScript on Vite, deployed as a static SPA, with TanStack Router
(route-level code splitting), TanStack Query, TanStack Virtual for the ledger,
and Tailwind v4 reading its theme from CSS tokens. **English only**, and
there is no i18n library: the scaffolding was removed, so adding a second
locale means adding the library, its storage key and that key's guard
together, not one array entry. It holds
no signing keys, renders no reports, and performs no money arithmetic — see
the settled items in the next section.

It reads live data: every route queries the API through `lib/api.ts`, and each
response is parsed against a row shape in `lib/rows.ts` rather than cast, so a
payload that does not match the contract surfaces as a failure instead of
rendering as a wrong figure. The sample-data module it used to read from has
been deleted.

**What remains is contract gaps, not missing stacks.** Where the two sides
disagree today, an open issue names it — a response field the contract does
not describe, a status value the contract does not list, a limit whose units
differ between the deployed function and the specification. Those issues carry
the contract the frontend needs; they are the work, and the list in them is
authoritative over any summary here.

## Before you change anything

**The reasoning behind every rule below is in `docs/GOALS.md` → "The hard
decisions".** Read it when you need to know *why*; the rules here are what
binds. Two decisions are still open — head publication and auditor identity —
and neither blocks a first schema.

Settled, and binding on backend work. **Each is a rule, not an argument** —
the reasoning behind them is in `docs/GOALS.md` and the decision records, and
none of it needs re-deriving to follow the rule.

**Wording — three honesty rules that bind copy, docs and comments alike:**

1. **"Tamper-evident", never "tamper-proof" or "immutable."** Hash-chaining
   makes tampering *detectable*, not impossible: whoever controls the database
   can recompute the whole chain.
2. **The auditor gives *reasonable assurance*, never a guarantee.** No string
   may say he certified, verified or confirmed that the accounts are correct.
3. **A hash miss reads "no entry in the chain this server sent you has this
   hash"** — never "invalid" or "fake". Absence from a served chain proves
   nothing on its own (rule 13).

**Money:**

4. **Integer minor units plus an explicit ISO 4217 currency code.** ₹1,250.75
   is `125075` beside `"INR"`. **No floating-point currency at any layer.**
   Carry `currency` from the first schema though it is always `INR` today —
   backfilling it later would touch hash-chained rows. The unit is *minor
   units of the stated currency*, never a hardcoded ÷100: JPY has 0 decimals,
   KWD has 3. **Rounding is half-up to the minor unit**, applied explicitly
   rather than inherited from a language default.
5. **An allocation is materialised into the chain, never recomputed at read
   time**, and stores **both the ordered flat-id list it used and the flats
   selected for the remainder**, inside the preimage. The remainder goes to
   the flats with the **lowest cumulative remainder-received count**, ties
   broken by permanent registry ordinal, **counted per flat-set**; a new flat
   seeds at the **median** count, not zero. **Never seed the rotation from the
   entry's position in the chain** — `sequence mod N` changes a past
   allocation's expected output when a flat is added, so the ledger reads as
   tampered when it is not.

**Corrections and approval:**

6. **Nothing is ever edited or deleted.** A correction is a new entry
   referencing the one it corrects, with a **mandatory reason**; the original
   stays visible, marked reversed. **No edit, delete, void-in-place or
   soft-delete path** — mutating an entry breaks its hash. Three distinct
   operations: **reversal**, **reversal + replacement** (atomic), and **flag**
   (any resident marks an entry disputed, **no financial effect**).
   Server-side: **an entry is reversed at most once**, **a reversal cannot be
   reversed**, and "at most once" counts ***posted*** reversals — an abandoned
   attempt must not consume the entry's one chance. Balances net reversed pairs
   to zero by construction. **A reversal negates the original's stored per-flat
   rows line by line and never recomputes the allocation** — recomputing
   leaves a 1-minor-unit residue on ~two thirds of flats while the total still
   nets to zero, so nothing alarms and each resident's own figure is wrong.
7. **Approval is tiered by amount against a committee-set rupee limit.** At or
   below it: **treasurer *and* secretary, both**. Above it, and to change the
   limit itself: **N-of-M**. A limit of zero makes everything N-of-M and is
   the safe default. **The tier never reduces to one approver** —
   treasurer-alone is rejected at any limit.
8. **Above the limit, at least two-thirds of admins, rounded up** —
   `ceil(2M/3)`: 4 of 5, 5 of 7, never 3 of 5. **A hard floor in code, not a
   settings default**; configurable higher, never lower. **A reversal needs at
   least the tier of the entry it reverses**, or the tier becomes a laundering
   path.
9. **Both the limit in force and the required count live in the chain**,
   snapshotted when the first approval is cast, and **may only ever
   increase.** Reading either from live config is a correctness bug, not a
   simplification: an admin resigning mid-approval would otherwise lower the
   bar and make collected approvals retroactively sufficient. **Do not instead
   invalidate in-flight approvals when M changes** — that hands the committee
   a cancel button and requires voiding a signed chained approval, which rule
   6 forbids.
10. **Structuring is made visible, not blocked.** Below-limit entries to one
   payee crossing the limit in a rolling window render as **one aggregate
   marked as having crossed**, constituents listed, and appear in the AGM
   report. **Do not block the next entry** — it punishes a genuine run of small
   repairs and teaches splitting across payees, which is harder to see. Window
   length and whether it keys on payee, category or both is open.
11. **Default the admin count to statutory committee strength.** Maharashtra
   model bye-law 113: **11 members up to 100 flats, 13 for 101–200** — the
   whole band this product targets. Do not build a UI recommending four or
   five. **M≥3 is a floor because escalation needs a recipient who is not the
   accused**, not because 3 is safer to approve with — it is the weakest
   setting for approval integrity.
12. **A derived admin's vote does not count toward seating further admins.**
   The snapshot defends against resignations, not additions: once a group holds
   the threshold, each further appointment is self-financing. An admin seated
   under the low-admin exemption, or by a voting set containing a derived
   admin, is flagged **derived** in the chain; the mark costs exactly one
   thing, a vote on seating further admins, and clears by a vote of
   non-derived admins meeting the threshold or at the next election. **The
   exemption applies only at M≤1.**

**The chain, and what it cannot prove:**

13. **A hash chain proves a record did not change; it proves nothing about a
   record being absent.** Closing omission constrains the schema, so it cannot
   be retrofitted: a **strictly monotonic sequence number inside the
   preimage**; a published head that is a **signed tuple**
   `(hash, highest_sequence, entry_count, as_of, format_version)`, not a bare
   hash; and **`format_version` in both head and preimage**, so a deliberate
   preimage change reads as a migration rather than mass tampering.
   **The honest limit: this delivers completeness only against a head the
   client did not get from the server.** On a first-ever load an operator can
   serve entries renumbered 1..N under a head it signed, every check passing,
   the concealed entries simply absent. **So the published head must be
   fetchable by the client directly** — a recipient that takes delivery but
   exposes no client-readable endpoint does not close this.
14. **Signing keys are server-held**, so no key material reaches the client —
   and that is exactly why **the published head is part of the feature, not a
   later addition.** The operator could mint an approval, and hash-chaining
   inside a database the admins control detects nothing an admin with database
   access cannot repair. Mechanism and cadence are still open.
15. **Reports are generated server-side from signed data**; a client-rendered
   report can be altered before it is read. **Reversed entries always appear
   in reports** — omitting them conceals what the chain exists to prove.
16. **Adding a field to an existing kind rehashes every entry of that kind**,
   because every layout field is in the preimage. **Link records through new
   kinds, never by widening old ones.**

**The financial year:**

17. **An entry in a closed year cannot be reversed in that year.** The
   reversal posts in the **current** period as an adjusting entry referencing
   the original across the boundary — reversing inside an audited period
   invalidates a filed report. **Per-period totals come from entries *posted*
   in that period.**
18. **"Closed" means an auditor signed off** — not an admin action, not a date.
   The committee cannot close its own books. Implies an **auditor role**
   distinct from admin and resident, and a year-close record carrying identity,
   signature and timestamp. **Do not implement a date-based or admin-triggered
   close as a convenience.**
19. **Sign-off is atomic and carries one of four opinions** — `clean`,
   `qualified`, `adverse`, `disclaimer` — and a bad one **still closes the
   year**. **Severity is ordered `clean` < `qualified` < `adverse` <
   `disclaimer`**: a disclaimer is *worse* than adverse. The headline is **the
   most serious opinion ever received** (never "most adverse", ambiguous under
   this ranking), with history beneath it. **No opinion ever supersedes an
   earlier one — do not implement a newest-wins or changed-committee
   exception.** An earlier draft allowed one where the appointing admin set had
   changed; it was **removed, not narrowed**, for three reasons that each stand
   alone: any exception keyed on something the committee controls hands the
   committee the key, and a changed appointing set costs one appointment; it
   fires with nobody acting in bad faith, because the statutory auditor cannot
   serve more than two consecutive years, so a differently-appointed auditor
   arrives by operation of law every two years; and one-directional superseding
   leaves a wrongly-maligned society no route back, which is the problem the
   exception existed to solve. The accepted cost is that an honestly maligned
   society leads with its worst opinion — **the full list, each with its date
   and the auditor's stated reason, stays one tap away**, and the count is not
   in the headline. Superseding **never changes a closed year's figures**, and
   there are **no private auditor notes.**
20. **The report's body is the balance sheet and the P&L**, generated
   server-side from chained entries, both carrying the **true and fair**
   wording. Not attachments. **An adjusting entry against a closed year is
   disclosed at the AGM** in a **generated** section naming the entry, the year
   it corrects, the amount and the reason — generated, so it cannot be omitted.

**Residents, identity and flags:**

21. **The preimage carries a salted pseudonym, never a resident identifier.**
   Commit `H(society_salt || person_id || tenure_id)` with a **secret
   per-society salt that is never published or served**; resolve to a person
   server-side for treasurer, secretary and admin only. **A bare hash of a
   flat number, phone or email does not satisfy this** — the resident universe
   is 80–150, so an exhaustive table unmasks an author in milliseconds. The
   pseudonym is **stable per resident** (the distinct-resident counts depend on
   it) and **per-flag nonces are forbidden.**
22. **Identity follows the person and is scoped to an occupancy.** On a sale
   the buyer gets their own account and full read access; the seller keeps
   their pseudonym and their past flags. **Do not implement one account per
   flat handed over at sale**, however often it is asked for — the buyer would
   inherit the seller's pseudonym and every dispute the seller filed would read
   as the buyer's. Nothing in a preimage is ever rewritten for a sale.
23. **An occupancy record `(flat, person, start, end)` is the authority for
   access.** Access derives from an **open tenure**, never a stored permission
   flag. Revoking is **closing a tenure, never deleting an account**, and a
   tenure is never deleted because past flags depend on its handle. **Tenures
   must be allowed to overlap** — joint owners, and a buyer occupying before
   completion — so a schema enforcing one open tenure per flat is wrong.
   Exactly one tenure per *person* is active at a time.
24. **Tenants hold their own tenure and their own handle.** The owner-tenant
   link is **server-side and must never enter a preimage**, and the tenant must
   never be given the owner's handle. **The owner may see what their own tenant
   raised and nothing more** — a fourth visibility rule, scoped to that owner's
   own tenant, with no power to withdraw, edit or resolve it. **The tenant is
   told that their owner can see this**, at enrolment and on the flag surface.
   A tenant tenure closes independently; **closing an owner tenure cascades**
   to its tenant tenures.
25. **Flags are append-only: nothing is withdrawn or hidden.** A resident may
   append "raised in error" or "resolved"; admins may only append a response.
   **Only the flagging resident marks a flag resolved**, which removes the
   point of pressuring them. **An admin response does not pause the escalation
   clock.** At most one open flag per resident per entry, the headline figure
   counting **distinct flagging residents**; and **one flag must be able to
   cover a vendor, a period or a set of entries**, or a sum posted as 40 small
   entries costs one resident 40 flags.
26. **A mismatch report is its own object, not a flag.** A flag attaches to one
   entry; a fingerprint mismatch concerns the whole ledger. At most one open
   report per resident, updated rather than duplicated.

**Setup, sign-in and the other kinds:**

27. **A society is set up as a draft and chained only when it opens.** The
   platform admin creates the society and registers its president, and holds
   **no seat, no tenure, no key and no write path into an open society**. The
   president's setup is a draft; **nothing is chained until "Open the
   ledger"**, which writes `society_opened` with the **whole founding
   committee in one transaction** — seating them one by one after a
   president-only genesis would flag every one derived (rule 12). **Opening
   requires the election minutes**, chained as `document_attached` at
   sequence 2.
28. **Custom posts are display titles over the `member` seat**, and **tasks
   never complete a money movement** — a task lets someone start or prepare
   work, checked server-side, and who approves stays as rules 7–9 fix it. Every
   assignment change is chained (`tasks_set`).
29. **An opening balance and pre-existing arrears enter after open as ordinary
   proposals** with category `opening`, needing the committee vote. **No import
   path bypasses approval.**
30. **Sign-in is a ClearFunds ID plus a one-time code emailed to a personal
   address. No passwords.** The ID (`treasurer@<society>.com`,
   `riya.a101@<society>.com`) is a reference only — **no mail is ever sent to
   it.** An officer's ID belongs to the post and is relinked on handover,
   ending the old holder's sessions; a resident's ID is one per person per
   tenure, closes with the tenure and is **never reissued** (rule 22). Keys and
   approvals stay keyed by person, never by post. **The president never handles
   anyone else's code.** SMTP credentials live in the Supabase dashboard only;
   this repository is public.
31. **The president enters officers' emails and nothing independent checks
   them** — an **accepted risk, not a solved one.** The mailbox is the only
   sign-in factor, so a president who entered an address they control could
   approve as that officer and the two-approver rule would be gone without a
   trace in the chain. The only signal is an officer who never received their
   mail. **Never describe enrolment as verifying anyone**, and do not remove
   this rule without a check that does not rest on the president's word.
32. **A resident's "I've paid" claim is chained and becomes money only through
   a receipt proposal.** `payment_claim` carries flat, amount, date, method and
   reference — online only (`upi`, `bank_transfer`), UTR mandatory. **Its actor
   is absent and it never carries the claimant's pseudonym**: a pseudonym
   beside a flat id maps that pseudonym to a flat and unmasks every flag it
   raised. A reviewer turns a claim into a `receipt` proposal needing the
   approvals of rules 7–9, or rejects it with a mandatory reason; both outcomes
   are chained (`claim_closed`), and a declined or withdrawn receipt reopens the
   claim. Open more than 7 days shows as unreviewed.
33. **Notices are committee-reviewed before publication, and a vote is
   evidence, never an approval.** Publishing needs `ceil(2M/3)` approvals **of
   the current revision** — an edit clears earlier ones — snapshotted at first
   submission and only ever raised. **Votes are one per flat**, cast by any
   owner or the resident tenant, first ballot counting, eligible flats
   snapshotted when the vote opens; named or anonymous per vote. A named ballot
   carries the `flat_id`, an anonymous one `H(society_salt || vote_seq ||
   flat_id)`, and **a ballot never carries a person or a pseudonym** (rule 32).
   **A proposal may cite a closed vote and still needs its own approvals**, as
   a separate `proposal_ref` entry (rule 16).

If your work requires one of the unsettled decisions resolved, say so and ask
rather than picking a default.

## Conventions

- **Decisions go in `docs/decisions/`**, one file per entry,
  `NNNN-kebab-title.md`, numbered in order. Only load-bearing choices earn an
  entry — ones where reversing later would cost real rework. Format is in that
  directory's `README.md`.
- **How work moves is in [`CONTRIBUTING.md`](CONTRIBUTING.md): lanes and
  directory ownership, issues, branches, PRs and contracts.** In short: every
  change starts from an issue in your lane; branch `<area>/<issue>-<slug>` off
  `main`, **open the PR against `main`**, squash- or rebase-merged after the
  other person approves. `main` takes no direct pushes, and nobody — the admin
  included — merges without the other person's approval. Pushing new commits
  dismisses existing approvals, so **push before asking for review, not
  after.**
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

# ClearFunds — goals

ClearFunds is a web app that keeps an **append-only, tamper-evident expense
ledger for housing-society funds.**

Multiple admins — treasurer, secretary, committee members — log in and approve
entries. **No single admin can alter an entry on their own.** Residents get
read-only access to the full transaction history with a running balance.

*Transparent expenses, stronger communities.*

This document records what the product is for and why it is built this way. It
comes from the project's design research: a feature brainstorm, a mind map, an
empathy map, and a persona study. It describes intent, not implementation —
when code and this document disagree, one of them is wrong, and it is worth
finding out which.

---

## Who it is for

Residential housing societies of roughly **80–150 flats**, in India. The
vocabulary is specific and worth stating plainly: maintenance dues collected
monthly per flat, UPI and bank transfers, an annual general meeting (AGM), and
a financial audit the society is legally required to undergo each year.

Five roles, one shared need.

| Role | What they need |
|---|---|
| Resident | Transparency and visibility — read-only |
| Treasurer | Efficient expense management |
| Secretary | Verification and oversight |
| Committee | Shared responsibility |
| Auditor | Reliable financial records |

What all five want is the same thing: **trust and accountability.**

---

## The problem

Societies run their finances on a patchwork of disconnected informal tools —
Excel spreadsheets, paper registers, manual signatures, WhatsApp updates —
rather than anything built for the job.

That produces:

- Opaque record-keeping, and transactions that go missing
- Risk of unauthorized edits, or one person controlling the funds
- AGM audit preparation that takes weeks of manual work
- Multi-approval processes so unstructured they cause delay and friction
- Financial disputes between residents and committee
- Limited visibility, and transactions that are hard to trace

The people doing this work are not careless. They are volunteers managing other
people's money with tools that cannot show their work. A treasurer put it this
way: *"I hate being accused of opacity when I am just trying to manage records
manually."*

---

## What residents and committee members say

From the persona and empathy map research:

> "Where did our monthly maintenance money go?"

> "We need everyone's approval before spending."

> "A single trusted ledger would solve many disputes."

> "I just want to be able to check the records anytime."

> "Preparing for the annual AGM audit is going to take weeks of manual work."

And underneath the rest, the question the product exists to answer: *is someone
quietly mismanaging society funds?*

---

## Jobs the product has to do

1. Collect monthly maintenance fees
2. Record and categorize expenses
3. Track the available society balance
4. Generate monthly and annual reports

---

## How it works

A centralized digital ledger with:

- **Multi-admin approval** — at least two-thirds sign-off before an entry posts
- **Append-only records** — entries are added, never edited in place
- **Read-only resident access** to the full history, with the ability to flag
  an entry as disputed
- **Digital approvals**, replacing paper signatures
- **Automated financial reporting**
- **An auditor role**, distinct from admin and resident: an auditor's sign-off
  is what closes a financial year

### Making the record trustworthy

The ledger's integrity rests on five mechanisms:

- **Hash-chained records** — each entry carries a hash of the one before it, so
  altering any entry breaks every link after it
- **Append-only storage** — no in-place edits at the data layer
- **Timestamp and admin ID on every action**
- **Digital signature on each approval**
- **A public audit trail** anyone with access can verify

Taken together these make the history **tamper-evident**: a change cannot be
made quietly. See *Open questions* below for what that word does and does not
promise.

---

## Features

### Operations
- Per-flat monthly maintenance due / paid tracker
- Automatic reminders for pending dues
- Category-wise spend breakdown
- Searchable transaction history
- UPI and bank statement import, matched against recorded payments
- Flag / dispute mechanism for residents
- Committee member role management
- Recurring expense templates

### Reporting
- One-click PDF export
- AGM report
- Audit-ready annual report
- Year-over-year comparison
- Budget vs. actual tracking
- Configurable financial year

### Built for the field
These are constraints, not nice-to-haves. The people using this are volunteers
on phones.

- Simple interface
- Mobile-first
- WhatsApp integration
- Multiple languages
- Onboarding and training for committee members

---

## What success looks like

Increased transparency. Greater accountability. Improved resident trust. Fewer
financial disputes. Faster audits. Better financial management overall.

---

## Open questions

Decisions the research raises but does not settle. Each is load-bearing, and
each gets more expensive to change once entries are chained and real money is
recorded.

**Tamper-evident is not tamper-proof.** Hash-chaining makes tampering
*detectable* by anyone who verifies the chain. It does not make tampering
*impossible* — whoever controls the database can recompute the whole chain and
present a consistent forgery.

**Settled 2026-10-21:** signing keys live on the server, each approval carries
an audit record, and **the chain head is published outside admin control** on a
recurring schedule to recipients who keep their own copies. That published head
is what a recomputed chain can be caught against, so it is required rather than
optional. The claim the product makes is **the record cannot be changed
quietly** — never that it cannot be forged by whoever runs the server.
*Tamper-evident*, consistently; never *tamper-proof*.

**Still open:** the publication mechanism, cadence and recipients.

**Corrections are settled 2026-10-22.** Nothing is ever edited or deleted. A
correction is a **new signed, chained entry referencing the one it corrects**,
carrying a **mandatory reason**; the original stays visible permanently, marked
reversed. Three distinct operations: a **reversal** cancels an entry, a
**reversal + replacement** cancels and posts the corrected amount atomically,
and a **flag** lets any resident mark an entry disputed with **no financial
effect**. A resident can raise a dispute but cannot move money — if the admins
agree, they post the reversal themselves.

**Approval requires at least two-thirds of admins, rounded up**
(`ceil(2 × M / 3)`: 4 of 5, 5 of 7). A society may configure a **higher**
threshold, never a lower one. Reversals need the same threshold as the original,
so a minority cannot unwind a committee decision. An entry can be reversed at
most once, and a reversal cannot itself be reversed.

**An entry in a closed financial year cannot be reversed in that year** —
confirmed with a practising chartered accountant. The reversal posts in the
**current** period as an adjusting entry referencing the original across the
year boundary, so the closed year's filed figures stay intact. Reversed entries
always appear in reports; an audit report that omits them conceals exactly what
the chain exists to prove.

**A financial year is closed by an auditor's sign-off** — not by an admin
action and not by a date rolling over. The committee cannot close its own
books, for the same reason it cannot approve an entry alone: the party being
checked does not declare the check complete. Until the auditor signs off the
year stays open and entries in it remain reversible normally.

**Still open:** whether an adjusting entry needs specific disclosure in the
next AGM report, and whether a resident can withdraw a flag they raised.

**Key custody is settled, and it was settled against the stronger
cryptography.** Per-action signatures have to work for non-technical volunteers
on phones. Keys held on each admin's own device would stop even the server
forging an approval, but key loss is a realistic and frequent event for this
user base, and every workable recovery story reintroduces a shared secret. The
predictable outcome is a committee that writes the key down or asks for one
login they all use — N-of-M back to one person, while believing it is
cryptographically secure. **Keys are therefore server-held**, and the published
chain head above is what bounds the resulting trust in the operator.

**Audit report format may not be a free choice — awaiting a CA.** The annual
audit is legally mandated, so the governing state Cooperative Societies Act
likely constrains what the report must contain. **Blocked on professional
advice, not on design**; confirm before building the report output. Two
questions are outstanding: what the report must contain, and whether a
cross-year adjusting entry (a correction to a sealed year, posted in the
current one) requires specific disclosure in the next AGM report.

**Money representation is settled 2026-10-22.** Every amount is an **integer
count of the currency's minor units** (₹1,250.75 is `125075`) stored alongside
an explicit **ISO 4217 currency code**. Floating-point currency is ruled out at
every layer: the errors surface only at reconciliation, and retrofitting the
fix once entries are hash-chained means rewriting the chain. The currency code
is carried from the first schema even though it is always `INR` today —
**INR now, other currencies are future scope**, and backfilling that column
later would touch hash-chained rows. The unit is always *minor units of the
stated currency*, never hardcoded paise: INR has 2 decimal places, JPY has 0,
KWD has 3.

**Still open:** the rounding policy for computed amounts (interest, penalty,
pro-rata), where sub-minor-unit precision would otherwise be lost.

---

## A note on the source research

One inconsistency is worth recording so it is not mistaken for intent: the
empathy map's FEELS panel contains two lines describing a household grocery
shopper — *"relieved when shopping is over, but anxious about the next trip"*
and *"wants more control and efficiency in household management"*. Every other
panel describes a society committee member. These two appear to be residue from
a template or an earlier draft, and should not be read as product direction.

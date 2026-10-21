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

- **Multi-admin approval** — N-of-M sign-off before an entry posts
- **Append-only records** — entries are added, never edited in place
- **Read-only resident access** to the full history
- **Digital approvals**, replacing paper signatures
- **Automated financial reporting**

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
present a consistent forgery. What closes that gap is publishing the chain head
somewhere the admins do not control, so a recomputed chain can be caught. Until
that is decided, the guarantee is strong social accountability, not
cryptographic proof. The honest word is *tamper-evident*, and it is worth using
consistently.

**An append-only ledger still has to handle mistakes.** A wrong amount gets
entered; a resident disputes a charge. Neither can be fixed by editing, so both
need **reversing entries** — a new signed, chained entry that negates an earlier
one, leaving both visible. The mechanism is implied by the feature set but not
yet defined.

**Key custody is the hard problem.** Per-action digital signatures have to work
for non-technical volunteers, on phones, over WhatsApp, in several languages.
If signing is burdensome, admins will share credentials — and shared
credentials collapse N-of-M approval back into single-person control, the exact
failure the product exists to prevent. The security model and the field-reality
constraints meet here, and this is where the product is won or lost.

**Audit report format may not be a free choice.** The annual audit is legally
mandated, so the governing state Cooperative Societies Act likely constrains
what the report must contain. Worth confirming before designing the output.

**Money representation is a one-way decision.** How ₹ amounts are stored is not
yet specified. Floating-point currency in a ledger claiming audit-grade
accuracy produces errors that surface only at reconciliation, and retrofitting
the fix once entries are hash-chained means rewriting the chain. This should be
settled before the first schema.

---

## A note on the source research

One inconsistency is worth recording so it is not mistaken for intent: the
empathy map's FEELS panel contains two lines describing a household grocery
shopper — *"relieved when shopping is over, but anxious about the next trip"*
and *"wants more control and efficiency in household management"*. Every other
panel describes a society committee member. These two appear to be residue from
a template or an earlier draft, and should not be read as product direction.

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

- **Multi-admin approval** — the treasurer and secretary together below a
  committee-set rupee limit, at least two-thirds of admins above it
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
financial disputes. Better financial management overall.

**Not a faster audit — a more transparent one.** How long an audit takes
depends on the auditor's own procedures, not on our data model, so the claim was
withdrawn on 2026-10-22. What the ledger removes is the time spent reconstructing
what happened from paper and chat messages; what it cannot do is shorten the
auditor's work. Promising speed invites the one comparison the product loses.

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

**Still open:** the publication mechanism, cadence and recipients — now with
one requirement attached. **Whatever holds the published head, residents' own
software must be able to fetch it directly.** A recipient that merely receives
a head and exposes nothing readable does not close the gap it exists to close:
on a first-ever load, a server can serve a smaller, internally consistent
ledger under a head it signed itself, and every check still passes while the
concealed entries are simply absent. This rules out any arrangement where only
the operator can reach the record of what the head used to be.

**Corrections are settled 2026-10-22.** Nothing is ever edited or deleted. A
correction is a **new signed, chained entry referencing the one it corrects**,
carrying a **mandatory reason**; the original stays visible permanently, marked
reversed. Three distinct operations: a **reversal** cancels an entry, a
**reversal + replacement** cancels and posts the corrected amount atomically,
and a **flag** lets any resident mark an entry disputed with **no financial
effect**. A resident can raise a dispute but cannot move money — if the admins
agree, they post the reversal themselves.

**Approval is tiered by what the money is for.** The committee sets a single
rupee limit. **Below it, a transaction needs the treasurer and the secretary,
both** — the two roles that run the society's money day to day. **Above it, and
to move the limit itself, it needs the committee vote.** A limit of zero sends
everything to the committee, which is the safe setting for a society that has
not thought about it.

**It never comes down to one person.** The point of the whole product is that no
single admin moves the ledger alone, and the tier does not weaken that: it
trades nine signatures for two, never for one. A treasurer acting alone below
some limit was rejected outright — given time, a daily allowance adds up to
anything.

**The tier invites one specific trick, and the ledger answers it by showing
it.** Someone who wants to avoid a committee vote splits one large payment into
several that each sit below the limit. No threshold rule can catch that, because
each piece really is below the limit with two real approvals. So when payments
to the same payee add up past the limit, the ledger stops showing them as
unrelated small items and shows **one total, marked as having crossed the
limit**, with the pieces listed under it, and it goes in the AGM report. It
is not blocked: blocking punishes a genuine run of small repairs to one
contractor, and teaches splitting across different payees, which is far harder
to spot.

**Above the limit, approval requires at least two-thirds of admins, rounded up**
(`ceil(2 × M / 3)`: 4 of 5, 5 of 7). A society may configure a **higher**
threshold, never a lower one. **A reversal needs at least the tier of the entry
it reverses**, so a minority cannot unwind a committee decision and nobody can
post below the limit and quietly reverse below the limit on repeat. An entry can
be reversed at most once, and a reversal cannot itself be reversed.

**The required number is fixed when the first approval is cast, and can only go
up.** Otherwise an admin resigning halfway through lowers the bar and an entry
becomes approved on fewer approvals than were ever asked for — nobody has to be
acting in bad faith for that to happen. The mirror-image rule, cancelling the
approvals already given whenever the committee's size changes, was rejected: it
would hand the committee a way to kill an inconvenient reversal on demand, over
and over. "Reversed at most once" therefore counts reversals that actually
**posted**; an abandoned attempt does not use up an entry's one chance.

**The admin count follows the society's statutory committee strength.** The
Maharashtra model bye-laws set the managing committee at 11 members for a
society of up to 100 flats and 13 for 101 to 200 — which is the whole band this
product is for — so the earlier plan to recommend four or five admins was
simply wrong about its own market and has been dropped. Three remains a hard
floor, but only for a narrow reason: a dispute has to be able to reach someone
who is not the person being disputed, which is impossible with two. It is *not*
that three is safer to approve with — counted out, 2-of-3 collusion takes 67%
of the committee against 75% at four admins and 80% at five, so three is the
weakest setting for approval integrity, not the floor that delivers it. A
three-admin society can set its threshold to 3 and get unanimity back.

Two results from working the arithmetic out properly are worth stating, because
both are the opposite of what intuition suggests. A 13-admin committee needs a
*lower* share of itself to collude (69.2%) than a 5-admin one (80%), so a bigger
committee is not automatically safer. And seating one additional admin sometimes
leaves the approval threshold completely unchanged — at 5 to 6 admins, 8 to 9,
and 11 to 12 — so "add one more member" is not reliably a strengthening move
either.

**Admins seated during an emergency cannot vote to seat more admins.** This one
took four rounds of trying to break it to get right. Freezing the threshold at
the moment approvals start protects a society against admins *resigning*, but
not against admins being *added*: once a group holds the threshold in a
three-admin committee, every further appointment pays for itself, because
seating an ally adds a vote while the required threshold rises only two times in
every three. Working the margin out, it never turns negative and keeps growing.
The practical consequence is that a single appointment made without a vote —
the kind an emergency rule has to allow when a committee has collapsed — is
enough to end up with a completely different set of admins, for the price of a
few resignation letters. So an admin seated that way is permanently marked in
the record, and that mark costs them exactly one thing: a vote on seating
further admins. They approve expenses, reversals and year-end closes like
anyone else. The mark clears once the ordinary admins vote to clear it, or at
the next election. A society genuinely rebuilding after a walkout is unaffected
— two honest admins can take a committee from two members back to a full
eleven without ever stalling.

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

**A flag cannot be withdrawn — settled 2026-10-22.** Nothing in the ledger is
ever removed, and a dispute is no exception. A resident who raised one in error
can append that; a resident who is satisfied can append that too, and **only
they can mark their own flag resolved.** The point is to leave nothing worth
pressuring anyone over: there is no delete button to be talked into pressing.
Admins can respond, and **a response does not stop the clock** — otherwise
"we replied" becomes a way to postpone indefinitely. A flag can also cover a
vendor, a period, or a group of entries as a single dispute, so that a sum
split across forty small entries does not cost a resident forty separate
complaints.

**The auditor's verdict is one of four, and a bad one still closes the year.**
`clean`, `qualified`, `adverse`, or `disclaimer` — the last being what an
auditor records when the records they asked for were never produced, so no
opinion can honestly be formed. Sealing a year and endorsing it are different
things. A year shows **the most serious opinion it has ever received**, with the
full history beneath it, and a later audit can only govern over an earlier one
if the committee that appointed it had itself changed. Both halves matter: one
sour auditor should not mark an honest society permanently, and a committee
should not be able to appoint its way to a clean report. Nothing about
superseding changes a sealed year's figures. The auditor keeps no private
notes — what they record, residents read.

**Severity runs `clean`, `qualified`, `adverse`, `disclaimer`, in that order.**
A disclaimer is **more serious** than an adverse opinion: an auditor who was
blocked from doing the work at all is a louder warning than one who did it and
found the accounts wrong.

**The auditor gives reasonable assurance, never a guarantee.** He does not
certify that the books are correct. He says the accounts are reasonably assured
on the evidence he examined — they look sound, and error may still exist.
Nothing in the product may claim he verified or certified them. This is the same
kind of honesty rule as *tamper-evident, never tamper-proof*: the weaker, true
claim is the one that survives contact with someone who checks.

**The report's body is the balance sheet and the profit and loss account**, each
carrying the **true and fair view** wording, both generated from chained entries.
**An adjusting entry that corrects a closed year must be disclosed at the AGM** —
it is not enough for it to sit in the current year's ledger. That disclosure is
generated, not typed, so it cannot be left out.

**Still open:** whether an adjusting entry needs specific disclosure in the
next AGM report, and **how an auditor proves who they are** when they come to
sign off. A login emailed to a committee-controlled mailbox would give back most
of what the appointment rules were designed to prevent.

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

**Rounding is settled 2026-10-22: half-up to the minor unit**, and the paisa
that will not divide evenly goes to **whichever flats have received it least
often so far**, counted separately for each group of flats a charge is split
between. This sounds like a triviality and is not. Splitting a bill across 100
flats leaves a paisa over almost every month, and handing it to the same flat
each time compounds into a visible, indefensible gap by the AGM — measured at
twelve paise over a year, which is small money and a bad conversation.
Rotating by "who has had it least" keeps the lifetime difference between any
two flats at a single paisa even after five years. Counting separately per
group matters for the same reason: when a parking charge is split across only
the flats that have parking, a shared counter quietly pushes the odd paisa onto
everyone else, producing exactly the sentence nobody wants to defend — *"the
software charges flats without parking more maintenance."*

**A new flat starts in the middle of the pack, not at zero**, or the newest
owner — the one with least reason to trust the committee — receives the odd
paisa in ten of their first twelve months.

**A correction reverses the stored per-flat split line by line; it never
recalculates it.** Recalculating leaves a one-paisa error on roughly two thirds
of flats while the total still comes to zero, so no total ever looks wrong
while individual residents' figures are permanently off.

---

## A note on the source research

One inconsistency is worth recording so it is not mistaken for intent: the
empathy map's FEELS panel contains two lines describing a household grocery
shopper — *"relieved when shopping is over, but anxious about the next trip"*
and *"wants more control and efficiency in household management"*. Every other
panel describes a society committee member. These two appear to be residue from
a template or an earlier draft, and should not be read as product direction.

## Who residents are, and where the proof is published

**Settled 2026-10-22.** A resident is identified by phone number, email and
flat number, and the society's own admin creates the accounts rather than
residents signing themselves up. Residents are anonymous to each other, while
the treasurer, secretary and admin can see who is who.

Those two things are harder to hold together than they sound, and the obvious
implementation fails badly. Whoever raised a dispute is written into the
tamper-evident record — that is what stops anyone quietly changing who
complained — but anything written there can be recomputed by any resident. A
society has between eighty and a hundred and fifty flats, so simply scrambling
the flat number is not enough: there are few enough possibilities to try them
all, and a neighbour can work out who complained in a fraction of a second.
Scrambling a phone number is no better, because a neighbour already has the
society phone list.

What goes into the record instead is a handle derived from the resident's
details **and a secret belonging to that society**, held by the server and never
published. The record still proves who raised what, and nobody can swap it. A
resident sees only a meaningless handle. The committee looks up the real person.
And because the handle is the same every time for the same resident, the product
can still say how many **different** residents raised a dispute rather than how
many times a button was pressed — which is the figure that matters, and the one
that stops a single angry resident looking like a crowd.

One limit is worth stating plainly: a handle that stays the same is still a
handle, so a resident whose disputes always concern their own flat can be
identified from their behaviour. That is not something cryptography fixes. It is
handled by being careful about where the handle is shown at all.

**Accounts belong to people, not to flats.** When a flat changes hands the buyer
gets their own account with access to the full history, and the seller keeps
their own past disputes attributed to them. The tempting shortcut — one login
per flat, handed over with the keys — is refused, because the buyer would
inherit the seller's handle and every dispute the seller ever raised would
appear to have been raised by the buyer. In a product whose whole promise is a
record that does not lie, that is not a compromise worth making.

More precisely, a resident's handle is tied to a **period of occupancy** rather
than to the person for all time. Someone who lives in a flat, sells it, and buys
again years later is treated as a new resident the second time. That sounds like
a drawback and is in practice the opposite: access can be ended simply by
closing the occupancy, with nothing deleted and no past dispute disturbed. It
also means the society keeps a truthful record of who was living there when each
dispute was raised, which is the question anyone looking back actually asks.

This needs the society to keep track of who occupies which flat and between
which dates — and that record, not a separate list of permissions, is what
decides who can see what. Two people can hold the same flat at once, which
happens with joint owners and when a buyer moves in before the paperwork
finishes, so the system has to allow it rather than assume one resident per
flat.

**Tenants get their own account, held under the owner.** A tenant can raise
disputes in their own name, and the owner of that flat can see what their tenant
raised — the owner still carries responsibility for the flat, so they are not
kept in the dark about it.

What a tenant does **not** get is the owner's identity in the record. A dispute
raised by the tenant is recorded as the tenant's, not the owner's. That sounds
like a detail and it is the whole point: if the two shared one identity, the
record would say the owner complained when the tenant did, and two different
people raising two different disputes would look like one person complaining
twice. Both of those are the product lying about its own history, which is the
one thing it exists not to do.

The owner's view of their tenant is deliberately narrow. They can see what was
raised. They cannot withdraw it, change it, or mark it settled — only the
person who raised a dispute can say it is resolved — and they gain no visibility
of any other resident in the society.

**And the tenant is told this.** Anonymity between neighbours is a promise the
product makes, so an exception that quietly includes a tenant's own landlord
would make that promise false. A tenant disputing a charge their landlord
benefits from is exactly the situation where this matters, so it is stated when
their account is created and again when they raise something, rather than buried
in terms nobody reads.

**The published fingerprint lives outside the committee.** The chain proves no
entry was edited, but it cannot by itself prove nothing was removed — someone
running the server could rebuild the whole thing and leave things out. So a
short fingerprint of the ledger is published on a schedule somewhere the
committee does not control, and a resident's phone fetches it **directly from
there**, never through our own server. If the app supplied both the ledger and
the fingerprint it is checked against, it would be marking its own homework.

The practical choice is a small file in a separate public repository, which any
browser can read directly and which costs nothing. Two details were checked
rather than assumed. A programmatic interface was rejected because it refuses
more than sixty requests an hour from one address, and a society typically
shares a single address — so at a general meeting, with everyone checking at
once, residents would start being turned away, which looks exactly like
something being hidden. And the date attached to a published file proves nothing
on its own, because those dates are supplied by whoever publishes. What counts
as evidence is that the file exists and what it contains.

Whoever holds that account must not be a member of the committee. Otherwise the
one property the whole arrangement exists to provide is gone.

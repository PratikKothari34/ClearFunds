# The ClearFunds frontend design

**Status: the built frontend design, called D throughout.** Three earlier
explorations — **A** *The Passbook* (the ledger is ink on paper), **B** *The
Noticeboard* (what changed since I last looked), **C** *The Chain* (every row
carries its hash link visibly) — were each built and taken through the full
six-step pass before this one. They are referred to by letter below, where a
position or a security finding was inherited from them; **they are not live
and are not built.**

D places each idea on the one surface where the reader is actually asking its
question: **B's** on opening the app, **A's** on reading the ledger, **C's** on
doubting it. Each idea owns one surface and does not leak onto the others —
that rule is what keeps three ideas from reading as noise to a non-technical
reader, and it is why **C's per-row spine, B's cards and A's full monochrome
discipline are all deliberately absent.**

---

## 0. What this design is constrained by

Not stylistic. These come from the product and bind every decision below.

| Constraint | Consequence for design |
|---|---|
| Mid-range Android, working 4G | The hero cannot be a video or a 2 MB font payload. Route-level splitting from the start. |
| Volunteers, not finance staff | No jargon in the primary path. A label the treasurer has to learn is a defect. |
| Six roles | President, treasurer, secretary, committee admin, resident, auditor. Navigation and approval surfaces are designed against six. |
| Money is other people's | Amounts are the most important pixels on every screen. Never decorative. |
| Tamper-**evident**, never tamper-proof | No shield icons, no green ticks implying proof. The honest visual is a *fingerprint*, not a padlock. |
| Reversed entries always visible | The ledger shows history, not current truth. The hardest surface in the product. |
| Residents anonymous to each other | A handle is shown, never a name, on any resident-visible dispute. |
| Auditor gives reasonable assurance | No string anywhere reads "verified", "certified" or "accounts correct". |
| One app, a resident sees a quarter of it | Sectionalization must survive a viewer who never sees most of the surface. |

**One rule on the hero loading page, carried forward from the earlier
exploration.** It is a real first-load moment, not a spinner, because the
resident read path fetches the ledger *and* the externally published
fingerprint, and the fingerprint comes from a different origin. That wait is
real, so it gets designed. **No fake progress bar** — a bar that fills on a
timer while a fetch is still pending is the product lying on its first screen,
which is the one thing it cannot afford.

---

## 2. The three ideas, placed

### From B: the dashboard answers "what changed"

The home dashboard opens with an **activity band** — not a feed, one band —
bounded to five items, ordered by what needs *this viewer* first.

- Server-held watermark (`last_seen_sequence`), so it survives a cleared
  browser, a second device and a shared phone. **This is a backend dependency D
  inherits from B and cannot avoid.**
- Counts bucketed past 40. Never a negative count: if the server's watermark is
  behind a cached one, the server's wins.
- **One amber band maximum, and only for what needs this viewer.** A pending
  approval for a treasurer, an unresolved flag on your own flat, a sign-off for
  the president. Not "a new expense was added" — that is information, not an
  obligation.

### From A: the ledger is ink on paper

The ledger screen is **A's, essentially unchanged**, because A's ledger was the
best of the three and the ledger is the product.

- Tabular figures, Indian digit grouping. **Inter throughout**, for the amount
  and the narration both, with tabular figures set globally rather than per
  element (`app.css:149`). No serif renders anywhere; see §2g for the two
  families that actually ship and for the Source Sans / Source Serif pair that
  `0007` chose and the build never adopted.
- Credit and debit as the only colour accents on the screen. **The activity
  band's amber does not appear on the ledger**, so the palette rule holds where
  it matters.
- A reversed entry and its reversal are **one row item**, struck through with
  the reversal linked beside it, `<s>` plus a visually-hidden "cancelled" so a
  screen reader announces it. Running balance stays consistent while showing
  rows that do not contribute.
- Nothing collapses. No hamburger. Payee wraps, amounts never do.

### From C: the claim is one tap away, not on every row

C's thesis survives in full. Its graphics do not.

- **The fingerprint band sits on the dashboard**, second, under the balance.
  Reports **two dates** — when the record was published and when this device
  last compared — never a one-word status.
- **A first visit says so out loud:** *"First time on this device. Nothing
  earlier to compare against yet."* This costs D the same best screenshot it
  cost C, and for the same non-negotiable reason.
- **`Verify` is a screen**, reachable from the dashboard band and from any
  entry's detail sheet. Returns **a list, always**, even of one — the 32-bit
  short form collides at ~4.55% within ~17 years at this product's entry rate.
- **The word "hash" never appears in resident copy.** "Fingerprint", everywhere.
- Entry detail shows the entry's fingerprint and the previous one. **No
  preimage field is ever rendered** — the chain, not the contents of what was
  hashed.

---

## 2b. Navigation

Six roles. D takes A's structure, because A's was built from a role count and
survived its own pass.

```
RESIDENT       TREASURER/SEC     PRESIDENT        AUDITOR
+----------+   +-----------+     +-----------+    +-----------+
| Home     |   | Home      |     | Home      |    | Home      |
| Ledger   |   | Ledger    |     | Sign-off (1)   | Ledger    |
| My flat  |   | Approvals (2)   | Approvals (2)  | Year-end  |
| Disputes |   | Disputes  (1)   | Disputes  (1)  | Disputes  |
+----------+   | Dues      |     | Reports   |    +-----------+
               | Reports   |     +-----------+
               +-----------+
```

- **Mobile: bottom tab bar, max 5.** Treasurer's sixth goes to `More`
  (Disputes and Reports); **anything carrying a count badge is promoted out of
  `More`**. President's bar is `Home / Sign-off / Approvals / Disputes / More`
  and `Sign-off` is never demoted.
- **Desktop: left rail, same items, no collapse.** A rail that collapses
  teaches a volunteer to hunt.
- **Second level is tabs within a page, never a nested menu.** Ledger gets
  `All / Reversed / Flagged`. **`Verify` is reached from the fingerprint band
  and from an entry's detail sheet — it is not a nav item**, because a resident
  who never doubts the record should never be asked to.
- **No hamburger.**
- Role filtering is **cosmetic**: the server refuses hidden surfaces to direct
  requests.

**Where D differs from A:** the resident keeps 4 items, so the one surface this
audience uses most stays the simplest. C made `Verify` a nav item; D does not,
because promoting it to the bar tells every resident on every screen that
doubt is a normal state. It is one tap from the thing that would cause the
doubt, which is the right distance.

---

## 2c. The home dashboard

Four bands, fixed order, borrowed from A's structure with B's band inserted
second.

```
+--------------------------------------------------+
|  ClearFunds        Sunrise CHS           [ o ]   |  theme toggle
+--------------------------------------------------+
|                                                  |
|   Rs 4,82,350.00                                 |  39px, tabular
|   as of 22 Oct 2026 - 847 entries                |
|                                                  |
+--------------------------------------------------+
|  2 things need you                               |  amber, only if real
|  - Approve: Shree Sai Plumbing, Rs 12,500        |
|  - Your flat: flag on Oct maintenance            |
+--------------------------------------------------+
|  Record published 22 Oct - checked here 21 Oct   |  fingerprint, two dates
+--------------------------------------------------+
|  This month      In 1,24,000    Out 86,450       |
+--------------------------------------------------+
|  Recent                                          |
|  ... last 5 entries ...                          |
+--------------------------------------------------+
```

| Band | Collapses when empty? |
|---|---|
| 1 Balance | **Never** |
| 2 Needs you | **Reserves the slot, varies the content** — never vanishes |
| 3 Fingerprint | **Never** — absence would read as a pass |
| 4 This month | Never |
| 5 Recent | Never; shows "no entries yet" |

**Band 2 is the one real merge decision on this screen, and it carries a defect
B's pass had to repair.** B originally let an empty section render nothing,
which moves every tap target below it by ~96px and makes the feature
undiscoverable. D keeps the repair: **the slot is reserved, the content
varies.** With nothing pending it reads *"Nothing needs you right now"* in
`--ink-2`, not amber, and the bands below never move.

**A zero-amber dashboard is the normal case for a resident**, and that is
correct. Amber means *this viewer must act*. A resident with no flag and no
dues sees none for months, which is what makes it mean something when it
appears.

---

## 2d. The hero loading page

A's hairline, because D is A's ledger and the hero should look like the product
it opens.

| Condition | Behaviour |
|---|---|
| Resolves < 400 ms | **Hero never renders.** Below 400 ms a hero is a flash. |
| 400 ms - 4 s | Stroke animates as the fetches land. |
| > 4 s | Stroke reaches 90% and **holds**, copy says the connection is slow. **Never completes on a timer.** |
| Fingerprint fails | Stroke stops, turns `--debit`, dashboard loads with the band in its unreachable state. |
| `prefers-reduced-motion` | **No stroke.** Static wordmark plus a text status line. |

**The 400 ms floor and the 90% hold are the whole design.** A progress
animation that completes while a request is outstanding is the product lying on
its first screen.

- **The dashboard is not held on the fingerprint fetch** — borrowed from B.
  The hero ends when the shell and ledger head are ready; the fingerprint band
  carries its own pending state. Blocking the whole app on a cross-origin fetch
  is the wrong trade.
- **Wordmark only, zero images.** The brand mark is on the login screen
  adjacent, at 240 px.
- **Nothing animates except the stroke**, and the stroke is tied to real fetch
  state.

---

## 2e. The light/dark switch

**Step 2 found this undesigned in all four documents.** Each philosophy
specifies both palettes and every token is computed and passing, and each
design draws a toggle in the header — but none states what the toggle *does* on
first load, which is where this goes wrong.

- **Default is `prefers-color-scheme`**, not light. A volunteer who runs their
  phone in dark mode and opens a ledger that flashes white at night learns the
  app ignores their phone.
- **An explicit choice overrides the system and persists** in `localStorage`,
  wrapped in try/catch, correct when absent. This is already inside the
  permitted storage boundary — per-viewer display preference, never a figure
  and never an identity.
- **The theme is applied before first paint**, via a tiny inline script in
  `<head>` that sets a `data-theme` attribute. Applying it after hydration
  gives a white flash on every cold start in dark mode. **This is the single
  implementation detail most likely to be skipped and most likely to be
  noticed.**
- **The toggle is a two-state switch, not a three-state cycle.** Light/dark,
  with the system default as the untouched starting state. "System / Light /
  Dark" as a rotating control makes a volunteer press a button three times to
  find out what it does.
- **It is in the header on every screen**, never buried in settings. A resident
  reading a ledger outdoors at noon needs it where they are.
- **No transition animation on the switch.** Cross-fading an entire ledger of
  amounts is motion attached to no state change in the record.

**Both palettes are complete and computed — see section 2f.** Dark is not a
filtered light theme; `--credit` and `--debit` have separate dark values
because an inverted red on a dark ground reads as a warning rather than a
debit.

---

## 2f. The palette, complete

**Every ratio below was computed from `app.css` on 2026-11-07**, with the WCAG
2.1 formula `(L_hi + 0.05) / (L_lo + 0.05)` against the theme's own
`--surface`. Body text needs 4.5:1; large text and graphical objects need 3:1.

An earlier version of this table listed nine tokens of a warm-paper palette
(`--surface #FBFAF7`, `--ink-quiet`, `--rule`) with ratios to match. **None of
those tokens exists.** The shipped palette is cool-neutral and the names are
different; the table below is the real one.

| Token | Light | Dark | Role | Light ratio | Dark ratio |
|---|---|---|---|---|---|
| `--surface` | `#ffffff` | `#121722` | Card and sheet ground. | — | — |
| `--bg` | `#f4f5f7` | `#0a0d14` | Page behind the cards. | — | — |
| `--ink` | `#0d1320` | `#e8ebf1` | Primary type. | 18.57:1 | 15.01:1 |
| `--ink-2` | `#4c5566` | `#a0a9ba` | Secondary type, labels, meta. | 7.50:1 | 7.58:1 |
| `--accent` | `#2f45c7` | `#93a4ff` | Links, primary action. | 7.51:1 | 7.68:1 |
| `--credit` | `#0b6b47` | `#55c995` | Money in. | 6.55:1 | 8.69:1 |
| `--debit` | `#a13a1e` | `#f2937a` | Money out. | 6.69:1 | 7.88:1 |
| `--attention` | `#9a4a00` | `#f4b75c` | Needs **this viewer**. | 6.26:1 | 10.05:1 |
| `--anchor` | `#2d4a8a` | `#8fb0ee` | Externally published / verified-against. | 8.54:1 | 8.21:1 |
| `--break` | `#9b1c3b` | `#f08ca6` | Mismatch, gap, reversal. | 8.01:1 | 7.69:1 |

Each colour token also has a `-soft` fill for chips. **Every one clears 4.5:1
against its own tint** in both themes, the tightest being `--debit` light at
5.66:1 — so a chip's label is body text, not decoration.

**Two rule tokens, and only one of them is a graphical object.** `--line`
(`#dde1e8` light, 1.31:1) is a hairline *divider* and is deliberately below
3:1: it separates, it does not carry meaning. `--line-strong` (`#8a93a3`,
**3.10:1** light / 3.81:1 dark) is the one that must stay visible, and light
clears 3:1 by 0.10 — it may never be used for text, and never thinned below
1px.

**A palette token without a computed number beside it has not been checked**,
which is why `tokens.test.ts` recomputes all of this from the stylesheet
rather than storing expected ratios. It also asserts the
`prefers-color-scheme: dark` block and the explicit `[data-theme='dark']`
block are **the same palette** — two ramps that drift apart would give a
system-dark phone different colours from one that chose dark by hand.

**Two rules that make the table true at render time:**

- **`--ink-2` is never reduced in opacity.** Recomputed 2026-11-07:
  `opacity: 0.7` over `--surface` takes the light token from 7.50:1 to
  **3.56:1** and the dark from 7.58:1 to **4.33:1**. Both fail 4.5:1. The
  numbers moved with the palette; the prohibition did not.
- **Colour is never the only signal.** `--credit` and `--debit` are
  accompanied by sign and column position, because deuteranopia affects roughly
  1 in 12 men and a green/red amount pair is the worst available encoding for
  it.

**Nine tokens is the ceiling.** Each one means exactly one thing. A tenth would
need a meaning no existing token carries.

---

## 2g. Type

**Two families, both self-hosted.** Verified against
`frontend/src/styles/fonts.css` and `public/fonts/` on 2026-11-07.

| Family | Token | Weights | Role |
|---|---|---|---|
| **Inter** | `--font-sans` (`app.css:117`) | 400, 500, 600, 700 | Everything: UI, amounts, labels, headings |
| **JetBrains Mono** | `--font-mono` (`app.css:118`) | 400, 500 | Fingerprints and hashes — anywhere even character widths let two strings be compared down a column |

Both stacks fall back to the platform face (`ui-sans-serif` / `ui-monospace`),
so `font-display: swap` never leaves a figure unrendered.

**Tabular figures are set globally**, not per-element: `font-variant-numeric:
tabular-nums` at `app.css:149`. A figure cannot opt out of it by accident,
which is the point — digits that shift width between rows make a column of
amounts unreadable.

Sizes come from **Tailwind's scale**, not a custom ramp: `text-4xl` for the
balance figure a resident checks first, `text-3xl` for a money input,
`text-[13px]` and `text-[12.5px]` for meta and fingerprints. Quiet text is
`--ink-2` (`text-ink-2`), the only de-emphasis token; there is no
`--ink-quiet`.

**Dropped along the way, and why it is not coming back:** Source Sans 3 and
Source Serif 4 were the pair in `0007`, and a hex-subset mono was to be built
for fingerprints. A high-contrast display serif on a warm ground is the most
recognisable signature of a generated page, so the serif went and a band
heading became a quiet caption. The subset mono went too, but the need it
served was real — JetBrains Mono answers it with a shipped face rather than a
custom subset.

**Five rules:**

- **16px is the floor for any figure a resident checks.** Not 14, not 15. A
  person verifying their own maintenance payment on a phone held at arm's
  length is the design case.
- **`tabular-nums` on every amount, without exception.** Proportional figures
  make a column of rupee amounts fail to align, which makes a correct ledger
  look wrong.
- **No tracked-out caps anywhere**, including labels. Caps at 12.8px with added
  letter-spacing is less legible, not more authoritative.
- **68 characters is the line cap** on any prose — a reason, a disclosure, an
  empty state.
- **`--ink-2` is never reduced in opacity**, restated here because it is a
  type decision as much as a colour one.

---

### Rules earn their place, and the heading does not get one

**Added 2026-10-25, after the second "it looks chopped".** Two decisions
that were each defensible alone, and wrong together.

The band carried a bottom hairline. The heading inside it sat **on** its own
hairline. Both were argued for in `Band.tsx`'s own comments — the section
border is the boundary, the heading rule attaches a heading to the section it
opens — and **the pair was never looked at**. Five bands put **ten hairlines
down a phone screen at even spacing**, with every heading at the same size and
weight.

That is the chopped look, and it has a precise cause: **a rule that appears
under every heading regardless of content carries no information.** A rule
should mean *these two things are separate*. Printed unconditionally it is
texture, and the page becomes equal strips with nothing dominant and nothing
recessive. The eye has no landing point.

| Device | Before | After |
|---|---|---|
| Section boundary | `border-b` hairline | unchanged — this one is a real boundary |
| Heading | `text-head`, semibold, **on a rule** | `text-meta`, medium, `--ink-2`, **no rule** |
| Vertical rhythm | `py-(--cf-s3)` on all five | `primary` band `s4`, reference bands `s3` |
| Hairlines on the dashboard | 10 | 4 section boundaries + 1 inside the balance block |

**The heading became a caption.** At `text-head` semibold it competed with the
balance figure — the one number most of this product's audience opens the app
to read. A reference band's heading exists to be *found when looked for*, not
read first. Demoted to a quiet caption, the figure is the only large thing on
the screen and needs no instruction to be found.

**Not** a tracked-out ALL-CAPS eyebrow. That is template chrome that appears
whatever the subject, and it costs legibility on the device this is read on.
Case is left alone; the colour does the demoting.

**Spacing is uneven on purpose.** Equal padding on every band is the other half
of the effect. `tone` defaults to `quiet`, so the fourteen route files that use
`Band` get the calmer treatment without being edited, and only a screen's actual
subject asks for `primary`.

### The balance and its provenance are one block

**Decided 2026-10-25.** A resident arrives with **one** question — *how much
money is there, and can I trust the number* — and the dashboard answered it in
two bands of equal weight, a scroll apart. The fingerprint band was something
you could skip past. Attached to the figure under a single hairline, it is part
of reading the figure.

The dashboard is now **four blocks**: balance + provenance, what needs you,
this month, recent.

**This is not the merge `FingerprintBand` forbids.** That comment rules out
folding the chain check into the **to-do list**, where an empty list would read
as an all-clear and mask a break. A balance is not a status and makes no claim
about the chain, so there is nothing for it to mask. The distinction is worth
keeping straight, because the forbidden version looks superficially similar.

Two hazards came with it, both handled in code rather than left to the reader:

- **A mismatch is hoisted above the figure.** Its copy ends *"do not rely on
  the figures above"*, which is only true if the warning is read first. Below
  the number it is read second, or not at all. `AnchorBody` takes a
  `hideMismatch` flag so the sentence is **moved, never duplicated** — two
  identical warnings read as two faults.
- **Each half still fails alone.** `'fingerprint'` remains its own `BandName`
  with its own failed flag and its own retry, passed in under anchor-prefixed
  props. A balance that loaded renders whatever the anchor did, and an anchor
  failure renders `unreachable` rather than a blank, because a blank reads as a
  pass.

**One copy of the provenance switch**, exported as `AnchorBody` and shared with
the standalone band. Two copies would let one drift into saying *verified*,
which is the one claim this product may never make.

**Guarded by `balanceProvenance.test.tsx`**, and the guard was mutation-tested:
moving the warning below the figure, coupling the two failures, blanking a
failed anchor, and duplicating the warning each kill a test. That mattered
— **the merge from five bands to four passed all 479 existing tests without
one noticing**, which is exactly the shape of a vacuous suite.

### A JSX newline before a full stop renders as a space

Found in the same pass. `{expr}` on one line and `.` on the next collapses the
newline to a space, so the sentence rendered **"checked on this device 21 Oct
2026 ."** — on the line every resident with a healthy ledger reads. Eight
sites across six files, all of the shape `</Link>` then a bare `.`; each is now
`{'.'}` glued to the preceding expression.

Worth naming because it is invisible in the source — the JSX looks correct,
and no test asserting on substrings catches a stray space.

### Separators between facts

**A meta line joins two facts with a vertical rule, never a middle dot**
(2026-10-25, `0007`). `A · B · C` is template chrome: it appears on
generated pages whatever the subject, and it reads as one run-on string
rather than as separate facts. The rule is the register's own device - the
line between two columns - and it is already in the palette as `--line`, with
`--line-strong` for the one that must stay visible.

**The rule is `aria-hidden`, so it carries NO WORD BOUNDARY, and a
visually-hidden separator must sit beside it.** This is not a detail. The
middle dot it replaced was a text node with a space on each side; the rule
contributes nothing to the accessible name, so swapping one for the other
fused the facts:

| Separator | Accessible name |
|---|---|
| Middle dot | `as of 25 Oct 2026 · 42 entries` |
| Rule alone | `as of 25 Oct 202642 entries` |
| Rule + hidden comma | `as of 25 Oct 2026, 42 entries` |

The middle row is the bug as it stood in the working tree: the year runs
into the entry count and a screen reader announces one impossible number,
directly under the one figure a resident opens the app to read. **Nothing
looked wrong on screen and no test failed** - because nothing in the suite
asserted on the separator at all.

Guarded by `frontend/src/components/dashboard/separator.test.tsx`, which
asserts **the boundary, not the punctuation**: nothing but digits may sit
between the end of the first fact and the start of the second. A later
change from a comma to a dash passes; a change that drops the boundary
does not. Both fixtures deliberately put a digit on each side, because
that is the only arrangement in which losing the boundary corrupts a value
rather than merely looking cramped. A first version of that test looked
for a run of five or more digits instead, which fitted the balance band's
`202642` and **passed a mutant of the entry row**, where the same bug
produces only `225` - the threshold was a property of one fixture, not of
the rule.

**13 rendered · sites remain across 6 files** - `ApprovalItem` (4),
`FlagHistory` (2), `disputes` (3), `ledger.$entryId` (1), `my-flat` (1),
`reports` (2). They are outside this pass's scope, and each needs the
hidden separator when it is converted.

**The three · in `lib/titles.ts` are NOT in that count and must stay.**
They build the document title (`Ledger · ClearFunds`), which is a
string, not a rendered line: there is no element to draw a rule on, and a
screen reader reads the title text itself, so the dot is already the
boundary. Converting one would be a straight regression.

## 2h. Optimization

The standing bundle budget, against mid-range Android on working 4G.

- **Route-level splitting from the first commit.** The resident read path —
  hero, dashboard, ledger — is its own chunk and must not import approvals,
  reports, dues, sign-off or committee management.
- **`Verify` is its own chunk.** It was to carry a hex-subset mono face; it
  carries no font at all. The platform monospace stack does the job, so the
  resident path is at A's weight while carrying C's idea **and** the route
  that was supposed to pay for it pays nothing.
- **Fonts:** system face until the webfont lands, `font-display: swap`,
  metric-matched fallbacks. Latin subset preloaded, and **that is the whole
  font payload** - the product ships English only, so no second script family
  exists to defer.
- **The ledger is virtualized** (TanStack **Virtual**, not Table — built
  2026-10-23). The ledger is not a grid: rows are heterogeneous, a reversed
  pair is one variable-height item, and nothing is sorted or filtered
  client-side, so a table library's column model buys nothing and costs
  ~12 KB gzipped. `@tanstack/react-table` was removed from the dependencies
  rather than left unused, so it cannot be imported back in by accident.
  `dues.tsx` is the one real `<table>` in the product and is hand-written,
  because its rows genuinely are homogeneous.
- **A reversed pair is one row item of variable height, never two rows** —
  splitting it across a virtualization boundary shows a struck-through row
  whose reversal is off-screen, which is the worst single rendering failure
  available in this product.
- **Amounts formatted once**, memoized per currency via `Intl.NumberFormat`.
  Constructing a formatter per cell is measurable in a long table.
- **The frontend does no money arithmetic.** It renders what the server
  computed. The x100 input boundary is the only conversion and is tested
  directly.
- **The activity band costs one request, not a feed.** Five items, bounded,
  fetched with the dashboard payload rather than separately.

---

## 2i. Sectionalization

**Nothing collapses, anywhere.** Band positions are identical on every visit,
so they are learnable and tap targets never move.

- 8px base scale. **32px between bands, 16px within**, so grouping is
  unambiguous without rules between sections.
- Full-bleed on mobile with a **16px gutter**. The layout works at **320px**
  with no horizontal scroll, and the amount column fits `Rs 1,20,00,000` at
  16px at that width.
- **Cards are used nowhere on the dashboard.** D inherits A's position: a card
  around a figure implies the figure is a separate object with its own
  lifecycle, and a balance is not that.

---

## 2j. Contract this design needs from the backend

Frontend-only project; this is what D needs and does not implement.

| Need | Why |
|---|---|
| `last_seen_sequence` per viewer, server-held | Survives cleared browser, second device, shared phone |
| Bucketed "new since" count | Never a raw number past 40, never negative |
| Per-viewer role-filtered attention items | Band 2 must not be assembled client-side from a fuller payload |
| Fingerprint response carrying publication time **and source** | The band reports two dates and names where the record was published |
| Rate-limited short-fingerprint lookup | `Verify` must not become an enumeration oracle |
| Filter responses reporting excluded counts | A filtered ledger must say what it is hiding |
| Role-filtered payloads, not client-trimmed | A hidden field is one devtools pane away from visible |
| Printed/exported fingerprint longer than 32 bits | The short form collides; a printed artifact must not |
| Flag author resolvable to treasurer/secretary/admin, **absent from resident payloads entirely** | Anonymity cannot be a rendering decision |
| Theme preference is **not** server-held | It is a display preference; sending it to the server makes it a profile attribute |

---

## 3. What this costs, measured

All figures below were measured off the tree on **2026-11-07**, not estimated.
An earlier version of this section described a Source Sans 3 / Source Serif 4
payload of 50.2 KB and claimed no mono face existed; none of that matched
`public/fonts/`, and the numbers here replace it.

**Fonts: 139.9 KB across six woff2 files, Latin subsets, downloaded once.**
Inter at 400/500/600/700 is 96.7 KB (23.1–23.9 KB each); JetBrains Mono at
400/500 is 43.0 KB (20.7 and 21.3 KB). Unlike the superseded account, opening
`Verify` does **not** cost zero — fingerprints are set in a real mono face, so
the two JetBrains files are part of the payload wherever a hash is shown.

**Font bytes are not a live design argument at this throughput.** At ~10 Mbps
on a working 4G connection the whole set is ~0.11 s, once, then cached. The
serif was dropped on the grounds in `0007` — that it read as generated — not
on bytes.

**JavaScript and CSS, gzipped, as `npm run budget` reports them:** the
framework entry chunk 76.2 KB against a 130 KB ceiling, all CSS 8.4 against
12, the vendor chunks outside the entry 99.8 against 108, and the largest
route chunk `ledger` 11.5 against 50. Every route is far inside its ceiling;
the vendor total is the one line with little headroom left.

**The ceilings sit just above the measured baseline, deliberately**, rather
than against a transfer time — so a careless import is a regression at 10 Mbps
exactly as it was at 1.5. Raising the assumed throughput is never a reason to
raise one.

**Brand assets.** `/login` loads `logo-128.png` at 28.3 KB, via
`src/components/Logo.tsx`, with no `srcset` — a single raster, not the
`mark-240.webp`/`mark-120.webp` pair an earlier draft of this section
described; neither file exists. `icon-512.png` is **302 KB**, the largest
asset in the tree by a wide margin, but it is referenced only from
`site.webmanifest` and is fetched at install time, not on any page load. The
favicons are 48.4 KB and 2.4 KB. **The hero stays wordmark-only** — the mark
is not on a returning resident's critical path.

**Two of these are worth revisiting:** `icon-512.png` at 302 KB is a PNG doing
a job WebP would do in a fraction of it, and `favicon-180.png` at 48.4 KB is
large for an apple-touch icon. Neither is on the read path, so neither is
urgent, and `check-assets.mjs` guards only that referenced assets *exist*, not
that they are small.

**The one standing cost is B's backend dependency**, the watermark, filed with
the other backend needs. A and C needed nothing of the kind.

---

## 5. Positions established by the earlier passes, carried unchanged

**These were settled by the six-step pass on A, B and C and are not re-opened
here.** They are restated in full because this is now the only design document;
nothing below depends on reading anything else.

**Security (step 3):**
- No pseudonym rendered to a resident in any form, including no derived avatar.
  Flag counts, never authorship. Dates, never minute-level timestamps. No
  sort/filter/group by actor on any resident-facing view.
- Role-filtered navigation is **cosmetic**. The server refuses hidden surfaces
  to direct requests; payloads arrive role-filtered, not client-trimmed.
- **D stores exactly one thing on the device: the watermark integer**, plus
  theme and last filter. No amount, balance, entry, payee, narration, flag,
  reason, name, pseudonym, role or session material. A phone in an Indian
  housing society is frequently shared.
- A flag reason is resident-authored free text rendered to the whole society —
  text node only, never `dangerouslySetInnerHTML`.
- `Verify` is not an enumeration surface: no bulk paste, no upload, no
  URL-triggered lookup, and "no match" is a plain identical answer.

**States (step 2), established by the three earlier passes and carried here:**
zero entries; the first entry, which links to nothing; a
closed financial year, labelled as *an auditor signed off* and never *locked by
the committee*, with no reverse affordance at all; an adjusting entry against a
closed year, naming the year, closing date, amount and reason inline; offline
and partial failures, which never render a shorter ledger silently; text
overflow.

**Roles:** six. President's `Sign-off` is a statement about a period, never an
operation on entries — read-only rows, no row-level affordance, `Hold [month]`
with a mandatory reason as a first-class action, counts never summed with
approvals.

**Brand mark:** full mark on login at 240 px, 40 px desktop rail, 28 px mobile
header, print on report covers, simplified derivative as favicon. **Wordmark
only on the hero**, and the mark never animates.

**Contrast:** all nine tokens are computed and all pass, in both themes.
**The full table with its ratios is section 2f of this document** — it is not
held anywhere else, and a token without a number beside it has not been
checked.

---

## 5b. Security findings specific to D

**D is not just A plus B plus C, and the audit must not treat it as though the
inherited positions cover it.** Combining the three creates surface that none
of them had alone. Four findings, audited against the client-side categories
that apply to a static SPA holding other people's money: DOM XSS, broken
access control, IDOR, forced browsing, business logic flaws, insecure design,
missing security response headers, CORS and same-origin policy, session
hijacking, identification and authentication failures, and software and data
integrity failures.

### 1. Clickjacking was unaddressed in every design, including the three that passed

**This is a finding against A, B and C as well, not only D.** All three
state a Content-Security-Policy; **none states a frame policy.**

An approval button is the highest-value click in this product. Framed in a
transparent overlay on an attacker's page, a committee member who thinks they
are dismissing a popup approves a payment. The hash chain records it as a
genuine approval, correctly signed by the server on that admin's
behalf — **the chain cannot distinguish a framed click from an intended one,
and this is exactly the class of flaw the chain is not designed to catch.**

- **`frame-ancestors 'none'` in the CSP**, plus `X-Frame-Options: DENY` for
  older browsers. Headers are server-sent, so this is filed as a backend need;
  **but it is a frontend finding and the frontend must state it**, because a
  design that specifies an approval button without specifying that it cannot be
  framed has specified half a control.
- **No part of this product is ever intended to be embedded.** There is no
  legitimate iframe use case, so the policy is unconditional.

### 2. `Referrer-Policy`, and why D is the design that needs it most

**Unaddressed in all four.** D is the only one where it matters sharply:
`Verify` places a fingerprint in the interface, and the fingerprint band names
the external publication source.

If `Verify` is ever reachable at a URL carrying a query parameter, and the page
links out or loads anything third-party, **the fingerprint being checked
travels in the `Referer` header to a party that has no business knowing which
entry a resident is suspicious about.**

- **`Referrer-Policy: no-referrer`** for the whole application.
- **`Verify` takes no URL parameter, which §2 already required for a different
  reason** — it must not be an enumeration oracle. The two findings converge on
  the same control, which is a reason to trust it rather than to state it once.
- **No third-party requests from any authenticated screen.** No analytics, no
  font CDN, no error reporter on the ledger. Fonts are self-hosted, which the
  bundle budget already required.

### 3. The activity band is a new authorization surface

**A and C had nothing like it.** Band 2 shows *what needs this viewer* —
pending approvals, flags on your own flat, a sign-off. That is a per-viewer
authorization decision rendered as a list.

- **The band must arrive assembled by the server**, already filtered for the
  viewer. **It must never be a fuller "all attention items" payload that the
  client filters down**, which would put every committee member's pending
  approvals and every flat's flags into the browser of any resident who opens
  devtools.
- **An item in the band links to a surface the viewer can already reach.** The
  band is a shortcut, never a capability — tapping it must not be the only path
  to anything.
- **A resident's band never reveals another flat's business.** "Your flat" means
  theirs. This is IDOR expressed as a layout: the band is keyed by viewer, and
  the server resolves the key.

### 4. The theme-before-paint script conflicts with the CSP

**A real conflict between two things D asserts in different sections**, and the
kind of defect that only appears when designs are merged.

§2e requires an inline script in `<head>` to set `data-theme` before first
paint. §5 inherits a strict CSP. **A strict CSP blocks inline scripts**, so
either the theme flashes on every cold start in dark mode, or the CSP is
loosened with `unsafe-inline` — which would defeat the single most valuable
control against the flag-reason XSS this product worries about.

**Neither is acceptable. The resolution is a nonce or a hash:**

- The inline theme script carries a **CSP hash** (`'sha256-...'`) in the policy,
  or a per-response nonce. The script is three lines and never changes, so a
  hash is the simpler of the two and needs no per-request work.
- **`unsafe-inline` is never used**, for this or anything.
- **If the hash cannot be arranged, the flash is accepted, not the CSP
  loosening.** A white flash is a cosmetic defect on one screen; an XSS hole in
  a flag reason rendered to the whole society is not.

**Built outcome, corrected 2026-11-05: neither hash nor nonce in production -
the script is external.** The theme bootstrap is `public/theme.js`, a real file
served from the same origin, so production satisfies plain `script-src 'self'`
with **no `'sha256-'` entry at all**. That is strictly stronger than carrying a
hash: `index.html` holds **zero** inline scripts, which `npm run csp-hash`
asserts, and the check prints the hash one *would* need so that adding a script
back cannot pass quietly. A policy still carrying a hash for a script that no
longer exists is the stale-contract failure this section is about, one level up.

The dev server is the exception, and still needs a nonce. It cannot satisfy the
production policy at all - it injects every stylesheet as a `<style>` tag, so
the app renders fully populated and completely unstyled, silently, with no build
error - so it gets a per-start random nonce covering `script-src` and
`style-src` in the served HTML only. `'unsafe-inline'` is used in neither,
exactly as this section requires.

---

## 5c. States step 2 found undesigned in D

Beyond those inherited from A, B and C.

**A resident with no watermark yet, on the dashboard.** The activity band's
first render for a brand-new account has nothing to compare against. It shows
*"Nothing needs you right now"* in `--ink-2` — **not "0 new entries"**,
which implies a comparison that did not happen. Same discipline as the
fingerprint band's first-visit copy, and for the same reason.

**The band and the fingerprint disagreeing.** The activity band may say nothing
needs you while the fingerprint band shows a mismatch. **These are independent
and must never be reconciled into a single status.** A mismatch is `--break`
and is about the record; an empty band is about the viewer's to-do list. A
design that merged them into one "all good" indicator would let a quiet to-do
list mask a broken chain — **the worst available failure in this product.**

**A society where the president has not signed off for three months.** The
president's band shows one item, not three. **Sign-off is per-period and the
oldest unsigned period is the one that needs action**; listing three makes the
oldest look equal to the newest. The other two appear on the `Sign-off` screen,
oldest first.

**Partial dashboard failure.** The bands fetch independently. If the activity
band fails while the balance succeeds, **the band renders a retry, not an empty
slot** — in this design an empty slot means "nothing needs you", and a failed
fetch does not mean that. Inherited from B's finding, and it applies with more
force here because D has more independent bands than B did.

---

## 6. What D refuses

- **It does not draw the spine.** Structure on every row is C's signature, not
  the reader's need.
- **It does not promise a faster audit.** A more transparent one.
- **It does not say verified, certified or tamper-proof.** Tamper-evident. The
  auditor gives reasonable assurance, never a guarantee.
- **It does not claim completeness.** A hash chain proves no entry changed; it
  proves nothing about an entry never served. Only a comparison against a
  fingerprint the resident already held defeats a trimmed chain — which is why
  the band reports two dates and admits a first visit has nothing to compare
  against.
- **It does not let the president edit anything.** No role in this product
  moves the ledger alone.

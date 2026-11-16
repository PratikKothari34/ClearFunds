# Running the ClearFunds demo

How to get a working ClearFunds on a machine that has never run it, on Windows.

Written so a person or an agent can follow it without reading anything else.
If you are an agent: run the commands in order, read each verdict before
continuing, and do not skip the ordering note in step 3 — it is not
self-correcting.

## 0. What you get

A seeded housing society, **Gulmohar Heights**, with roughly 4,250 ledger
entries across several years, and sign-in buttons for every role — resident,
treasurer, secretary, committee member, auditor, president. No email, no OTP,
no account creation.

## 1. Check the machine

```powershell
git clone https://github.com/PratikKothari34/ClearFunds.git
cd ClearFunds
.\check-requirements.ps1
```

`check-requirements.ps1` only reads — it installs nothing and changes nothing.
It prints a line per requirement and exits **0** when the machine is ready,
**1** when something required is missing, naming the install command for each.

What it requires, and why each one matters:

| | Why |
|---|---|
| **Git** | To clone, and to switch revision in step 3 |
| **Node.js 20+** | The frontend, and `npx` runs the Supabase CLI — so no separate CLI install |
| **Deno** | Runs the seed script. **Without it the seed is silently skipped** and the app loads empty while every step still reports green |
| **psql** | `start.ps1` counts existing rows with it to decide whether to seed |
| **Docker** | Supabase runs in containers |

It also reports the Docker daemon, free disk (the images want roughly 5–8 GB)
and which revision you are on. Those are warnings, not blockers: `start.ps1`
starts Docker Desktop itself and waits for it.

Install anything it marks `[MISSING]`, then run it again until it exits 0.

## 2. Launch

```powershell
.\start.ps1
```

Five steps, each reporting its own result: Docker, Supabase, the frontend
environment file, the demo data, the dev server. Then it opens the browser.

Allow several minutes on a first run — it pulls the Supabase images and the
seed takes about a minute. Re-running is safe: it skips whatever is already up
and never re-seeds over existing data.

When it finishes:

| | |
|---|---|
| App | http://localhost:5173 |
| Supabase Studio | http://127.0.0.1:54323 |
| Inbox (sent mail) | http://127.0.0.1:54324 |

Sign in with the role buttons on the page — one per role, no password. They
appear only under the dev server, which is what `start.ps1` runs; a production
build never shows them.

## 3. If you want to demo the auditor sign-off

**Switch revision before the first `start.ps1`, not after.**

The year-end sign-off — an auditor giving an opinion and closing a financial
year, the one irreversible action in the product — needs a year that has ended
and is still open. On `main` the only audited year is already closed, so the
screen correctly offers no action and that part of the story cannot be shown.

```powershell
git checkout demo/142-closeable-year
.\start.ps1
```

`check-requirements.ps1` reports which side of this you are on, under
`Checkout`.

**Why the order matters.** `start.ps1` seeds only when the ledger is empty,
because re-seeding would append a second society. So a machine already seeded
from `main` reports `... ledger entries already seeded` and skips the seed on
every later run — switching revision afterwards changes nothing by itself. To
recover:

```powershell
cd backend
npx supabase db reset
cd ..
.\start.ps1
```

`db reset` briefly stops the API. If a request answers 503 rather than 401 for
a moment, the container is still coming back — wait rather than re-running.

With that revision checked out, sign in as the auditor and open **Year-end**:
FY 2024-25 shows *Ended, open* with a **Give opinion and close** button.

**Closing a year cannot be undone.** Nothing edits or deletes a chained entry,
and there is no reopen path. Once you close FY 2024-25 that machine has no
closeable year again until `npx supabase db reset`, so reset between runs if
you plan to show it twice.

## 4. What to show

A suggested path through the product:

1. **Ledger** — the full history. A reversed entry renders struck through with
   its reversal linked beside it; the running balance stays consistent while
   showing rows that do not contribute to it.
2. **An entry** — who approved it, when, and the fingerprint band. Approval is
   tiered: treasurer *and* secretary below a committee-set limit, at least
   two-thirds of the committee above it.
3. **Verify** — the device recomputes the hash chain itself and reports what it
   checked, rather than being told the chain is fine.
4. **Reports** — balance sheet and P&L generated server-side, carrying the
   *true and fair* wording, with adjusting entries against closed years
   disclosed in a generated section.
5. **Year-end** as the auditor — the sign-off, if you did step 3.
6. Sign in as a **resident** to show the same history read-only, with no way to
   alter it.

The claim throughout is that the record **cannot be changed quietly** — not
that it cannot be forged by whoever runs the server. The wording in the product
is *tamper-evident*, never *tamper-proof*.

## 5. When something is wrong

| Symptom | Cause |
|---|---|
| Blank page, no console error naming a variable | `frontend/.env.local` missing. Delete it if present and re-run `start.ps1`, which regenerates it from the running stack |
| App loads but is empty, every step reported green | Deno was not installed when it seeded, so the seed was skipped. Install Deno, then `npx supabase db reset` in `backend`, then `start.ps1` |
| `503` from the API | A container is down or restarting. `401` means reachable and unauthenticated, which is healthy |
| Supabase CLI cannot find its containers | Run it from `backend`, not the project root — the CLI derives container names from the working directory |
| Year-end offers no action | Expected on `main`. See step 3 |

[`docs/running-locally.md`](docs/running-locally.md) covers running each lane by
hand, without `start.ps1`.

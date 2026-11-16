# Running the demo on a second laptop

For demoing from a machine that has never run ClearFunds.

The repo is **public**, so cloning needs no account and no collaborator access.
Write access only matters for pushing and approving PRs.

## Prerequisites on that machine

- Docker Desktop
- Node.js (for `npx`)
- Deno (the seed script is Deno, not Node - without it `start.ps1` skips the
  seed and the app loads empty)
- `psql` on `PATH` (the seed guard uses it to count existing entries)

## The steps, in this order

```powershell
git clone https://github.com/PratikKothari34/ClearFunds.git
cd ClearFunds
git checkout demo/142-closeable-year
.\start.ps1
```

**Check out the branch BEFORE the first `start.ps1`.** This is the one ordering
that matters, and getting it wrong is not self-correcting - see below.

`start.ps1` then does everything else: starts Docker and Supabase, writes
`frontend/.env.local` from the running stack, seeds Gulmohar Heights, starts
Vite and opens the browser. Sign in with the role buttons on the page; no email
or OTP needed.

## Why the branch rather than `main`

`main` does not yet have a financial year the auditor can close. The seed's only
auditor appointment is against a year it then closes, so the sign-off screen
correctly offers no action and **that part of the ledger story cannot be shown.**
The fix is on `demo/142-closeable-year`, awaiting review on PR #144.

With the branch checked out, FY 2024-25 shows "Ended, open" with a **Give
opinion and close** button, signed in as the auditor.

Once #144 merges, `main` carries it and the checkout step can be dropped.

## If you seeded from `main` by mistake

`start.ps1` seeds **only when the chain is empty** - re-seeding would append a
second society, so the row count is the guard. That means a machine already
seeded from `main` will keep reporting `... ledger entries already seeded` and
skip the seed forever, so checking out the branch afterwards changes nothing on
its own.

Reset and reseed:

```powershell
cd backend
npx supabase db reset
cd ..
.\start.ps1
```

`db reset` stops the edge runtime briefly. If the app answers 503 rather than
401 for a moment, the container is still coming back up - wait for it rather
than re-running.

## Don't demo the sign-off twice without a reset

Closing FY 2024-25 is **irreversible** - it is the one such action in the
product, and nothing edits or deletes a chained entry. Once it is closed, that
machine has no closeable year again until `npx supabase db reset`.

So if you intend to show the sign-off more than once, reset between runs.

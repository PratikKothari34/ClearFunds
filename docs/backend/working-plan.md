# Backend working plan

How we work the backend together now that you are working in it too. This is a
coordination note, not a rule: `CONTRIBUTING.md` still governs, and this file
goes away when the list below is done.

Last updated 2026-11-07.

## How we avoid colliding

- **Tell me what you are taking.** Assign yourself the issue, or say so here. An
  unassigned issue on this list is mine, and I will say on it before starting.
- **Give me side tasks as issues assigned to `tadiPro250`.** I watch the repo
  and pick them up in the order you assign them. If one is urgent, say so on it.
- **Migrations:** the next free number is the highest on `main` or in an open
  PR, plus one. It is **31** now. Say on the issue which number you are taking,
  so two PRs never hold the same one.
- **Production:** one of us deploys, and only from `main`. Migrations go in
  number order, followed by a schema comparison against a local reset. Please
  leave this to me unless we agree otherwise: applying one out of order is what
  would make the comparison fail.
- **Contract changes** stay in their own PR, and a new kind ships with vectors.
- **I never push to a branch of yours**, and a push to mine that you have
  approved will only happen for a merge conflict, with a note saying what
  changed.

## What I am doing now, in order

1. **Getting the open backend PRs merged:** #69, #72, #75, #78 and #80, tested
   together and waiting for your review.
2. **#93, then #95 and #96:** the contract rows for #90 and #92, and the ledger
   vectors.
3. **#97, #98, #101, #114 and #115:** your findings on #66 and #84, the CSP for
   #5, and the monthly reversal figures you asked for on #109.
4. **#102:** the contract is in its own PR. The backend follows once you agree it.
5. **Deploying migrations 22-30 and the `api` function** as one verified batch,
   once 1 is merged. That is also what ends the statement-limit mismatch you
   flagged on #79.
6. **Budget (#76):** once #85 is approved, a backend PR with migration, report
   section and vectors.
7. **Rule 19:** decided yes. The server half is in its own PR, and commit 4 of
   #113 lands with it.

## Needs someone with an account

| What | Who |
|---|---|
| Create the anchor repo and its scoped token, then turn the publisher on (#1) | You hold the account, as you said on #66; I set the secrets |
| Require `ci-ok` on `main` | You, as admin |
| Auth Site URL, redirect allowlist and SMTP in the Supabase dashboard | Me |

## Questions for you

1. **Lanes.** `CONTRIBUTING.md` says we each stay in our own, and you are now
   working in `backend/`. Do you want that rule changed, or is this a temporary
   arrangement? Either is fine, but the file should say what is true.
2. **Who reviews backend PRs you author?** I assume I do, since the rule is that
   nothing lands on one person's say-so.
3. **#51:** you asked whether "at most one `election_minutes`" should be
   server-only. I think so: a client on a partial read cannot honestly assert it,
   and `api_open_society` already cannot write a second. Say if you disagree.

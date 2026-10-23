<!--
Target `dev`, not `main` (CONTRIBUTING.md 3.1). At most 400 changed lines and at most 3 days old.
A contract change is its own PR and is never bundled with implementation (section 6).
`Closes #N` only when every "Done when" item on the issue is done; otherwise `Part of #N`.
No Co-authored-by trailer and no agent attribution, here or in commits.
-->
Part of #

## What changed

<!-- Two or three lines: what behaves differently after this merges.
     Touching the other person's lane? Start this section with `crosses-boundary:` and the reason (section 2.3). -->

## Lane

- [ ] `frontend/` only (plus shared docs)
- [ ] `backend/` only (plus shared docs)
- [ ] `contracts/` only: spec, test vectors, and one `contracts/CHANGELOG.md` line
- [ ] Shared docs / `.github/` only

## How it was verified

<!-- The commands you actually ran and their output. "Tests pass" is not enough. -->

```
```

- [ ] There is a test that fails if this logic is removed
- [ ] The negative case is covered: a rejected reversal, a mismatched hash, a refused approval
- [ ] Anything hashed or signed reproduces the test vectors in `contracts/`

## Settled rules (AGENTS.md)

- [ ] No edit, delete, void-in-place or soft-delete path on ledger entries
- [ ] Money is integer minor units plus an ISO 4217 code, with no float at any layer
- [ ] No live config read where the chain holds a snapshot (approval threshold, rupee limit, admin count)
- [ ] Wording: *tamper-evident*, never tamper-proof or immutable; the auditor gives *reasonable assurance*, never "certified" or "verified"
- [ ] No secrets. This repository is public

## Reviewer

<!-- Request the other person by hand. GitHub only auto-requests when you cross into their lane. -->

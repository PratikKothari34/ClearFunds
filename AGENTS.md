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
- **`README.md`** at the root, once it exists — setup and how to run things.

There is no source tree yet. This repository currently holds scaffolding and
design documentation only.

## Before you change anything

**Read `docs/GOALS.md` → "Open questions" first.** Five decisions there are
unsettled, and each gets substantially more expensive after code exists. Three
will block or misdirect most implementation work:

1. **Money representation is unspecified.** Do not introduce floating-point
   currency. Errors surface only at reconciliation, and fixing it after entries
   are hash-chained means rewriting the chain. This belongs in the first schema
   decision, not after it.

2. **An append-only ledger still has to handle mistakes.** Wrong amounts and
   disputed charges cannot be fixed by editing. They need **reversing
   entries** — a new signed, chained entry that negates an earlier one, leaving
   both visible. No edit or delete path should be built on ledger entries.

3. **"Tamper-evident" is not "tamper-proof."** Hash-chaining makes tampering
   *detectable*, not *impossible* — whoever controls the database can recompute
   the entire chain. Do not write documentation, UI copy, or comments claiming
   the ledger is immutable or tamper-proof. The accurate word is
   **tamper-evident**, and the research uses it deliberately.

If your work requires one of these resolved, say so and ask rather than
picking a default.

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
- **Line endings** are normalized by `.gitattributes`: LF everywhere, CRLF for
  `.ps1`, `.cmd`, and `.bat`. Do not override it.
- **Licensing: GPL-3.0** (`LICENSE`, verbatim and not to be edited).
  Copyright holders are listed in `COPYRIGHT`; add a contributor there rather
  than altering `LICENSE`, which would break automated license detection.
- **Never commit secrets**, `.env` files, or build output. `.gitignore` covers
  the common cases, but it is not a safety net you should lean on.
- Some paths in `.gitignore` are intentionally local to a working copy and will
  not be present in your clone. Their absence is not a missing file.

## A note on the domain

This software records other people's money, and the people operating it are
volunteers, not finance professionals. Two consequences worth holding onto:

**Correctness outranks convenience.** A ledger that is approximately right is
worse than useless — it is misleading in a context where the whole point is
proving nothing was hidden.

**The security model only works if people can actually use it.** N-of-M
approval and per-action digital signatures are being delivered to volunteers on
phones, over WhatsApp, in several languages. If signing is burdensome, admins
will share credentials — and shared credentials collapse N-of-M approval back
into the single-person control the product exists to prevent. A security
measure that gets worked around has made things worse, not better.

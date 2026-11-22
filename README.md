# ClearFunds

[![ci](https://github.com/PratikKothari34/ClearFunds/actions/workflows/ci.yml/badge.svg)](https://github.com/PratikKothari34/ClearFunds/actions/workflows/ci.yml)
[![licence: GPL-3.0](https://img.shields.io/badge/licence-GPL--3.0-blue.svg)](LICENSE)

**A tamper-evident expense ledger for Indian housing societies.** Residents
read the full history with a running balance; admins approve entries and no
single admin can alter one alone.

Built for societies of roughly 80–150 flats, replacing the Excel sheet, the
paper register, the signature book and the WhatsApp update.

**Status: both stacks are built and run.** A seeded demo society of ~4,250
ledger entries comes up locally with one command and sign-in buttons for every
role — see [`demo.md`](demo.md). There is no public demo URL: the deployed
build authenticates against a real project, so the demo accounts exist only
under a local dev server.

Built by two people, one lane each — [`@PratikKothari34`](https://github.com/PratikKothari34)
on the frontend and [`@tadiPro250`](https://github.com/tadiPro250) on the
backend. Neither can merge their own work; see
[Contributing](#contributing).

## What makes it different from a spreadsheet

- **Nothing is ever edited or deleted.** A correction is a new entry that
  references the one it corrects and carries a mandatory reason. The original
  stays visible, marked reversed.
- **Entries are hash-chained**, so an entry cannot be changed without breaking
  every link after it. The chain head is published outside admin control, to
  recipients who keep their own copies.
- **Approval is tiered by amount.** At or below a committee-set limit, both the
  treasurer and the secretary must approve. Above it, at least two-thirds of
  the committee. The limit that applied at the time is recorded with the
  approval, so an approval cannot be legitimised after the fact by lowering it.
- **The financial year is closed by an auditor**, not by the committee and not
  by a date.

The claim is that **the record cannot be changed quietly** — not that it cannot
be forged by whoever runs the server. The product says *tamper-evident*, never
*tamper-proof*.

## The two stacks

Both exist and run. Each lane documents its own setup:

| | | |
|---|---|---|
| **Frontend** | [`frontend/README.md`](frontend/README.md) | React 19 + TypeScript on Vite, a static SPA. Holds no keys, computes no money |
| **Backend** | [`backend/README.md`](backend/README.md) | Supabase — Postgres holds the chain and every rule, one Deno edge function holds the signing keys |

The wire format between them is not either lane's to decide. It lives in
[`contracts/`](contracts/), with test vectors both sides check against.

**To just run it:** [`demo.md`](demo.md) is the whole path on a machine that has
never run ClearFunds — `.\check-requirements.ps1` tells you what is missing and
installs nothing, then `.\start.ps1` brings up both lanes, seeds the demo
society and opens the app. By hand:

```sh
# frontend
cd frontend && npm install && npm run dev

# backend (needs Docker, the Supabase CLI and Deno)
cd backend && supabase start && deno run -A scripts/seed.ts
```

Run each lane's own README before anything else — the backend needs an edge
function secret generated locally, and the frontend needs the Supabase URL and
publishable key in its environment.

Those two lines are Bash. [`docs/running-locally.md`](docs/running-locally.md)
has the same commands for **PowerShell**, which has no `&&`, plus how to leave
the dev server running in its own window, the local service URLs, how to seed
and sign in to the demo society, and what the common failures actually mean.

## Repository layout

| Path | What |
|---|---|
| `frontend/` | The SPA |
| `backend/` | Migrations, the edge function, the seed script, the pgTAP suite |
| `contracts/` | The wire format: chain entry preimage, kind layouts, the API shape, test vectors |
| `docs/` | Goals, the design, decision records |
| `demo.md` | How to run the demo from scratch, and what to show |
| `check-requirements.ps1` | Reads the machine and reports what the demo needs; installs nothing |
| `start.ps1` | Brings up both lanes, seeds, opens the app |
| `AGENTS.md` | Orientation for an agent working in this repository |
| `CONTRIBUTING.md` | Who owns which directory, and how a change lands |
| `.github/` | CI, issue and PR templates, CODEOWNERS, the branch ruleset of record |
| `.claude/hooks/` | A commit-and-push guard for coding agents. The script is committed; the config that runs it is per-machine and is not (`CONTRIBUTING.md` §10.1) |
| `vercel.json` | The deployed build's headers, including the Content-Security-Policy a test asserts against `frontend/.env.example` |

## Contributing

Issues and bug reports are welcome. Pull requests are read, but the repository
rules still govern how one lands — [`CONTRIBUTING.md`](CONTRIBUTING.md) opens
with a section for people who do not work on the project, then sets out
directory ownership and the PR rules. Read [`AGENTS.md`](AGENTS.md) if you are
an agent.

Work is split by person, not by ticket, and backend work starts from an
assigned issue rather than from reading the repository.

Every change goes up as a pull request. `main` is protected: linear history,
one approval, no direct pushes — and that approval has to come from the other
maintainer, so neither of us merges our own work. The repository admin has a
bypass and does not use it. A product built so that no single admin can move
the ledger alone should not be run from a repository where one person can.

CI runs on every pull request: the frontend gate (typecheck, lint, 1,351 tests
in 86 files, build, and the repository's own bundle-budget, inline-script and
asset checks), the backend's pgTAP suite against a database built from the
migrations alone, and both implementations against the shared test vectors in
[`contracts/`](contracts/).

## Licence

GPL-3.0 — see [`LICENSE`](LICENSE), kept verbatim. Copyright holders are
recorded in [`COPYRIGHT`](COPYRIGHT).

# ClearFunds

**A tamper-evident expense ledger for Indian housing societies.** Residents
read the full history with a running balance; admins approve entries and no
single admin can alter one alone.

Built for societies of roughly 80–150 flats, replacing the Excel sheet, the
paper register, the signature book and the WhatsApp update.

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

On Windows, `.\start.ps1` from the project root brings up both lanes, seeds the
demo society and opens the app. By hand:

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
| `AGENTS.md` | Orientation for an agent working in this repository |
| `CONTRIBUTING.md` | Who owns which directory, and how a change lands |

## Contributing

Work is split by person, not by ticket, and backend work starts from an
assigned issue rather than from reading the repository. Read
[`CONTRIBUTING.md`](CONTRIBUTING.md) for directory ownership and the PR rules,
and [`AGENTS.md`](AGENTS.md) if you are an agent.

Every change goes up as a pull request. `main` is protected: linear history,
one approval, no direct pushes.

## Licence

GPL-3.0. See [`LICENSE`](LICENSE).

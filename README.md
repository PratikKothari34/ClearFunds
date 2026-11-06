# ClearFunds

A web app that keeps an **append-only, tamper-evident expense ledger for
housing-society funds**, built for residential societies of about 80–150 flats
in India.

Several admins approve each entry, so no single admin can move the ledger
alone. Residents get read-only access to the full history with a running
balance, and can raise a dispute against any entry. An auditor, not the
committee, closes a financial year.

Tamper-evident is not tamper-proof: hash-chaining makes a change detectable,
not impossible. What bounds the operator is the chain head published each month
outside the committee's control. [`docs/GOALS.md`](docs/GOALS.md) explains why.

## Run it

You need Node, Docker, the [Supabase CLI](https://supabase.com/docs/guides/cli)
and [Deno](https://deno.com). Start the backend first:

```sh
cd backend
cp supabase/functions/.env.example supabase/functions/.env
# set CLEARFUNDS_SIGNING_SECRET in it:  openssl rand -hex 32
supabase start
deno run -A scripts/seed.ts
```

Then the frontend, in a second terminal:

```sh
cd frontend
npm ci
cp .env.example .env.local   # values are in frontend/README.md
npm run dev                  # http://127.0.0.1:5173
```

Each lane documents the rest of its own stack:

- [`backend/README.md`](backend/README.md): migrations, tests, onboarding a
  society, mail and the published head
- [`frontend/README.md`](frontend/README.md): scripts, layout and how it is
  checked

## Test it

```sh
cd backend && supabase test db                 # pgTAP
cd backend/supabase/functions/api && deno test -A
cd frontend && npm run verify                  # types, lint, tests, build, budgets
```

## Where things are

| Path | What |
|---|---|
| [`frontend/`](frontend/) | React and TypeScript SPA on Vite, with an independent chain verifier |
| [`backend/`](backend/) | Supabase: Postgres holds the chain and every rule; one edge function holds the signing keys |
| [`contracts/`](contracts/) | The boundary between them: API, chain encoding, test vectors both sides must reproduce |
| [`docs/GOALS.md`](docs/GOALS.md) | What the product is for, and what is still undecided |
| [`AGENTS.md`](AGENTS.md) | The settled rules that bind the code |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Lanes, branches, reviews and how a change reaches `main` |

## Licence

GPL-3.0. See [`LICENSE`](LICENSE) and [`COPYRIGHT`](COPYRIGHT).

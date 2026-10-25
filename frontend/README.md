# ClearFunds frontend

React 19 + TypeScript on Vite, TanStack Router (file routes, code-split per
route) and Query, Tailwind v4, Supabase JS. Deployed as a static SPA.

## Run it

Start the backend first ([`../backend/README.md`](../backend/README.md)),
then:

```sh
cd frontend
npm ci
cp .env.example .env.local   # values for the local stack are below
npm run dev                  # http://127.0.0.1:5173
```

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from `supabase status`>
VITE_ANCHOR_URL=             # where the chain head is published; empty = not yet
VITE_DEMO_LOGINS=1           # one-tap demo accounts, dev server only
```

With `VITE_DEMO_LOGINS` set, the sign-in screen offers the seeded society's
resident, tenant, treasurer, secretary, president, committee member and
auditor. A production build never contains them.

| Script | |
|---|---|
| `npm run dev` | Dev server, under the real production CSP (nonce, no `unsafe-inline`) |
| `npm test` | Vitest: contract vectors, money, colour contrast of every token |
| `npm run verify` | Typecheck, lint, tests, CSP and asset checks, build, bundle budget |

## Layout

| Path | What |
|---|---|
| `src/routes/` | One file per screen |
| `src/components/ui.tsx` | Every primitive: buttons, amounts, meters, sheets, fields, toasts |
| `src/lib/chain.ts` | The contract encoder, written independently of the backend's |
| `src/lib/verify.ts` | What a resident's own device can establish, and nothing more |
| `src/lib/money.ts` | Integer minor units. Nothing in it divides |
| `src/lib/api.ts` | Every read and write |
| `src/styles/app.css` | The tokens, both themes |

## Rules the code keeps

- **No money arithmetic.** Totals come from the server (`api_summary`,
  `api_report`). The client formats integer minor units by splitting digits.
- **Each colour means one thing.** Credit, debit; amber only for something
  this viewer must act on; blue-grey for checked against the published record;
  rose for a break or a reversal. Every pairing is tested at 4.5:1 in both themes.
- **"Fingerprint", never "hash"; "tamper-evident", never "tamper-proof";**
  nothing says verified, certified or guaranteed.
- **A missing check reads as missing**, never as a pass. Until a head is
  published outside the committee, every balance says so.
- **Residents never see each other's handles.**

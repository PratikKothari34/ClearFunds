# ClearFunds backend

Supabase: Postgres holds the chain and every rule; one Deno edge function
holds the signing keys. Contracts live in [`../contracts/`](../contracts/).

## Run it locally

Needs Docker running, the [Supabase CLI](https://supabase.com/docs/guides/cli)
and [Deno](https://deno.com).

```sh
cd backend
cp supabase/functions/.env.example supabase/functions/.env
# put a fresh value in it:  openssl rand -hex 32
supabase start                 # Postgres, Auth, REST, Realtime, the edge function
deno run -A scripts/seed.ts    # demo society: 96 flats, 11 admins, ~4,200 entries
supabase test db               # pgTAP: contract vectors + every approval rule
```

`supabase db reset` rebuilds from the migrations; run the seed again after it.
Mail sent locally (sign-in codes) lands in Mailpit at http://127.0.0.1:54324.

## Where things are

| Path | What |
|---|---|
| `supabase/migrations/…01_chain.sql` | The contract encoder in SQL, kind layouts, the append-only entry table, `cf.append` (the only writer) |
| `…02_people.sql` | People, flats, tenures and pseudonymous handles, the committee projection, row-level security |
| `…03_rules.sql` | Proposals, tiered approval, snapshotted thresholds, posting, reversals, allocation, flags, sign-off, year close |
| `…04_read.sql` | Read views, reports, structuring, opinions, registry, function privileges |
| `…05_live.sql` | Charge preview, dashboard summary, realtime |
| `supabase/functions/api/` | The signing boundary: authenticates, derives the admin's Ed25519 key, registers it, signs |
| `supabase/tests/` | pgTAP. `chain_vectors.test.sql` is generated from the contract vectors |
| `scripts/seed.ts` | Local demo data, driven through the real rule functions |

## How the rules are enforced

- **Every write takes the society lock** and checks its rule inside the same
  transaction it appends in. Sequence numbers come from the previous entry,
  never a sequence object, so they have no gaps.
- **`chain_entries` refuses UPDATE, DELETE and TRUNCATE** with a trigger,
  whoever is connected.
- **Functions that accept a signature are granted to `service_role` only.**
  A signed-in user cannot call them with a signature of their choosing;
  `supabase/tests/rules.test.sql` checks that.
- **Read views run as their owner and filter membership in their own WHERE.**
  Under `security_invoker`, row-level security re-applies inside every join
  and blocks the expression indexes: the proposals view took 1.1 s instead of
  20 ms. Strangers reading nothing is tested.

## Deploying to a Supabase project

```sh
supabase link --project-ref <ref>
supabase db push
supabase secrets set CLEARFUNDS_SIGNING_SECRET=<openssl rand -hex 32> CLEARFUNDS_ALLOWED_ORIGIN=https://<site>
supabase functions deploy api --no-verify-jwt   # the function authenticates the caller itself
```

The signing secret derives every admin key. Losing it means new keys (old
signatures still check against the keys already in the chain); leaking it
lets the holder sign as any admin, which the published chain head is what
bounds. Keep it out of the repository and out of any committee member's
hands.

## Not built yet

- **Publishing the chain head outside admin control.** `GET /api/head`
  returns the signed head tuple; nothing publishes it yet. Mechanism,
  cadence and recipients are open in `docs/GOALS.md`. Until it exists the
  app says so on every balance.
- **How an auditor proves who they are.** Auditors sign in like everyone
  else today. Open in `docs/GOALS.md`.
- **Reminders, statement import, recurring templates, budget vs actual.**

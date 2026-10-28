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
| `…07_society.sql` | Society status (`draft`/`setup`/`open`), opening with the minutes and one `tasks_set` per post, the posts projection |
| `…08_tasks.sql` | Task checks in front of the existing writes, `api_set_post`, the tour flag, `api_me` posts |
| `…09_platform.sql` | Platform admins, creating a society in draft with its president, the setup draft's table |
| `…10_setup.sql` | The president's setup draft and its problems, opening from the draft (flats, tenures), the `society-docs` bucket |
| `…11_ids.sql` | ClearFunds IDs that follow posts and tenures, and the enrolment mail they queue |
| `…12_codes.sql` | Code-request limits, the mail queue's sender functions and its cron job |
| `…13_claims.sql` | Residents' payment claims, their link to a receipt proposal, and closing them when it posts |
| `…14_notices.sql` | Notice drafts and the committee's review, publishing with ceil(2M/3) approvals, opening a vote |
| `…15_votes.sql` | One ballot per flat (named or anonymous), closing votes on a schedule, citing a carried option |
| `…16_lookup.sql` | Finding an entry by fingerprint, prefix, number or id, and everything linked to it |
| `…17_society_date.sql` | Whether a tenure is open is decided by the society's date (IST), not the database's UTC date |
| `…18_opening.sql` | Opening balances and arrears go to the committee; a charge can name one flat |
| `…19_reminders.sql` | Dues reminders to the residents of each owing flat, at most weekly; amounts written with the currency's own exponent |
| `…20_attachments.sql` | Files attached to notice drafts, part of the approved revision, readable by residents once published |
| `…21_templates.sql` | Expense templates: saved payee, category, description and fixed amount that pre-fill a proposal, never chained |
| `…25_statements.sql` | Bank statement credits in exact minor units, matched to claims by UTR when read; nothing chained. Also `money_text` without floating point |
| `supabase/functions/api/` | The signing boundary: authenticates, derives the admin's Ed25519 key, registers it, signs |
| `supabase/tests/` | pgTAP. `chain_vectors.test.sql` is generated from the contract vectors |
| `scripts/seed.ts` | Local demo data, driven through the real rule functions |

## Onboarding a society

A platform admin is a row in `platform_admins`, added by hand: there is no
route that creates one.

```sql
insert into public.platform_admins (auth_user_id)
  select id from auth.users where email = '<staff email>';
```

They create the society at `POST /api/platform/societies`; its president then
works through the setup draft (`api_setup_get`/`api_setup_save`), uploads the
election minutes at `PUT /api/setup/minutes`, and opens it at
`POST /api/open-society`. The routes are in `contracts/api/v1.md`.

## Sign-in and mail

Everyone signs in with a ClearFunds ID and a code emailed by Supabase Auth
(`templates/magic_link.html`). Enrolment mail is queued in
`private.mail_outbox` and sent by the edge function: straight after
`/open-society`, and every minute by a `pg_cron` job once the project's Vault
holds where to call and the shared secret:

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/api/mail/flush', 'clearfunds_mailer_url');
select vault.create_secret('<same value as CLEARFUNDS_MAILER_SECRET>', 'clearfunds_mailer_secret');
```

SMTP settings are function secrets (`CLEARFUNDS_SMTP_*`, see
`functions/.env.example`); for Gmail that is `smtp.gmail.com`, port 465 and an
app password. The same Gmail account goes in the dashboard under Auth → SMTP
for the sign-in codes. Without SMTP settings mail stays queued, never lost.

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

**If `db push` times out**, the network is blocking outbound Postgres
(5432/6543), which some office and campus networks do. Apply each migration
over HTTPS instead (dashboard SQL editor, or the Management API), inside one
transaction with its row in `supabase_migrations.schema_migrations` using the
file's version, so a later `db push` from an open network sees it as applied.
The production project was deployed this way on 2026-10-26.

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
- **Statement import, budget vs actual.**

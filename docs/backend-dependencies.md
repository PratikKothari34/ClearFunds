# What the frontend still needs from the backend

The frontend is built and deployed. This is the complete list of what it
cannot do until the backend supplies it, written so the backend side can be
built without reading the frontend source.

**This document states dependencies. It does not specify how to build them** -
schema, RLS, function bodies and deployment are the backend lane's calls.

Status as of 2026-11-04. The deployed site is live but shows no data: every
dependency below is unmet.

## 1. Three environment variables

Set at **build** time, so changing one needs a redeploy, not a restart.

| Variable | What it is | Without it |
|---|---|---|
| `VITE_SUPABASE_URL` | the project URL, `https://<ref>.supabase.co` | the client throws on first use |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the **publishable** key, `sb_publishable_...` | the client throws on first use |
| `VITE_ANCHOR_URL` | template for the published chain head, with a `{society}` placeholder | the record-check screen hides the anchor comparison and says so |

The first two are read in `frontend/src/lib/supabase.ts`. The client is built
behind a Proxy on first property access, so an unset pair throws **when
something calls the API**, never at import - the app loads and the sign-in
screen renders.

`VITE_ANCHOR_URL` is read in `frontend/src/lib/verify.ts`. Absent or
unparseable, `anchorUrl()` returns null and the screen degrades to no claim
rather than a false one.

**Never set `VITE_DEMO_LOGINS` in production.** It is applied at build time,
so setting it in a hosting dashboard is the one way to ship demo accounts.

## 2. Auth configuration the frontend cannot set for itself

Sign-in is a six-digit emailed code (`signInWithOtp` then `verifyOtp`).

- **The deployed origin must be in the Site URL / redirect allowlist.** The
  frontend sends `emailRedirectTo: location.origin`. If that origin is not
  allowed, the email is sent and the link bounces - a failure that looks like
  a mail problem.
- **Edge functions need the deployed origin in CORS.** Without it every write
  fails from the browser while working perfectly from curl.
- `shouldCreateUser` stays true, so a resident the committee registered can
  sign in the first time.

## 3. Fourteen RPCs

All called through PostgREST. **Thirteen are specified in `contracts/api/v1.md`
and need only to exist.**

```
api_add_person        api_add_tenure       api_flag_note
api_me                api_my_tenant_flags  api_preview_charge
api_raise_flag        api_report           api_report_mismatch
api_resolve_handle    api_summary          api_withdraw
api_years
```

**`api_mark_seen` is in no contract** - it is called by the frontend and
specified nowhere. Filed as issue #92.

## 4. Five tables or views, readable under RLS

```
chain_entries    committee_seats    flat_dues    flats    people
```

`chain_entries` is also the realtime source: the frontend subscribes to
`postgres_changes` for `INSERT` filtered by `society_id`, so **realtime must be
enabled on that table** or the ledger will not update without a reload.

## 5. Four edge functions

Each is called with `{ society, ... }` and its response is parsed, not cast -
a missing field is a visible error, not `undefined`.

| Function | Returns |
|---|---|
| `/propose` | `{ seq, status }` |
| `/cast` | `{ status }` |
| `/signoff` | `{ seq }` |
| `/close-year` | `{ seq }` |

`status` is a `cf.proposal_status`. The frontend handles all six values
(`posted`, `open`, `declined`, `withdrawn`, `superseded`, `year_closed`); the
API contract lists three. Filed as issue #90.

## 6. Seven chain kinds the frontend cannot verify

`frontend/src/lib/chain.ts` holds a byte layout per kind so it can recompute
each entry's hash independently. Seven kinds in `contracts/chain/kinds/` have
no layout here:

```
ballot    claim_closed    notice    payment_claim
proposal_ref    vote_closed    vote_opened
```

**This is not a crash and not a blocker.** An entry of an unknown kind is
skipped and the walk continues using the hash the server reported for it, so
one new kind cannot make the whole record read as broken.

**But those entries are trusted rather than verified**, which is the one thing
the product claims not to do. A resident sees them listed as unchecked. The
layouts are frontend work and are ours to add; they are listed here because
the gap closes only when the kinds are actually in use, and whoever ships a
new kind should know the frontend goes quiet on it until a matching layout
lands.

## 7. Response headers the SPA cannot set

Already set on the Vercel deployment and **verified live**: `nosniff`,
`Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy`,
HSTS, plus the SPA rewrite and immutable asset caching.

**CSP is not among them.** The production policy is `script-src 'self'` with
**no** `sha256-` entry - `index.html` carries zero inline scripts, which is
strictly stronger than allowing a hash. Issue #5 tracks it. Any future inline
script would be blocked silently in production, so `npm run verify` asserts
zero and prints the hash one would need.

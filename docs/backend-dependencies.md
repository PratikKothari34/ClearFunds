# What the frontend still needs from the backend

The frontend is built and deployed. This is the complete list of what it
cannot do until the backend supplies it, written so the backend side can be
built without reading the frontend source.

**This document states dependencies. It does not specify how to build them** -
schema, RLS, function bodies and deployment are the backend lane's calls.

Status as of 2026-11-05. The deployed site is live but shows no data: every
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

## 6. Chain kinds the frontend can verify — now all of them

`frontend/src/lib/chain.ts` holds a byte layout per kind so it can recompute
each entry's hash independently. **Every kind in `contracts/chain/kinds/` now
has one.** Seven did not — `ballot`, `claim_closed`, `notice`,
`payment_claim`, `proposal_ref`, `vote_closed`, `vote_opened` — so entries of
those kinds were skipped and the walk continued on the hash the server
reported. Not a crash, but those entries were trusted rather than recomputed.
They are now recomputed, driven against the contract's own vectors
(`contracts/chain/vectors/{society,claims,notices}-kinds.v1.json`, which
nothing had been reading), and `walk()` returns nothing as unchecked for them.

**What this asks of the backend: nothing today.** It is recorded here because
of what it means for a kind added later.

- **A new kind ships with its layout, or the frontend goes quiet on it.** An
  entry whose kind the frontend has no layout for is reported to the resident
  as not checked, and its hash is taken from the response. Adding a kind to
  `contracts/chain/kinds/` is therefore a frontend change too.
- **A new kind in `contracts/chain/kinds/` now fails the frontend suite**
  until it has a layout. The suite reads the contract markdown directly -
  each `###` heading naming a kind and its numbered field table - and compares it
  to the layout table field for field, in order. So the field numbering in
  that table is not documentation; it is the thing the hash is computed
  from, and renumbering a field there is a breaking change.
- **Please ship test vectors with it anyway**, in the shape the three
  existing files use: `layouts`, `entries` with `preimage_hex` and
  `entry_hash`, and `must_differ` pairs. Reading the table proves the two
  sides agree about the *layout*; only a vector proves they agree about the
  *bytes*. The encoders are independent implementations and share no code,
  and `ledger.v1.md` - which defines every kind that moves money - still has
  no vector file.
- **One thing a layout cannot express**, asserted over the vectors instead: a
  `ballot` carries exactly one of `flat_id` and `flat_token`. Both present
  would place a flat beside its own anonymous token and unmask the ballot.
  The frontend also recomputes the token from the salt, vote and flat, so a
  change to that derivation is a breaking change on this side.

## 7. Response headers the SPA cannot set

Already set on the Vercel deployment and **verified live**: `nosniff`,
`Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy`,
HSTS, plus the SPA rewrite and immutable asset caching.

**CSP is not among them.** The production policy is `script-src 'self'` with
**no** `sha256-` entry - `index.html` carries zero inline scripts, which is
strictly stronger than allowing a hash. Issue #5 tracks it. Any future inline
script would be blocked silently in production, so `npm run verify` asserts
zero and prints the hash one would need.

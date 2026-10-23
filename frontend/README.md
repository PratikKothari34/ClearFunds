# ClearFunds frontend

React 19 + TypeScript on Vite, built as a static SPA. The resident read
path — hero, dashboard, ledger — is the lightest route in the bundle and
stays that way.

```bash
npm install
npm run dev        # http://localhost:5173
npm run verify     # typecheck, lint, tests, build, and every check below
```

`npm run verify` is the gate. It runs the typecheck on the build project
graph (`tsc -b`, which is stricter than a bare `tsc --noEmit` and catches
things the latter misses), the lint, the full test suite, a production
build, and then four checks that each exist because something passed
review and was still wrong:

| Check | What it fails on |
|---|---|
| `npm run utilities` | A CSS theme token that shadows a built-in Tailwind utility, or a class used in markup that no rule defines |
| `npm run fixtures` | Development sample data reaching the production bundle |
| `npm run budget` | A chunk over its gzip ceiling, measured against mid-range Android on patchy 4G |
| `npm run csp-hash` | Prints the SHA-256 of the inline theme script for the CSP — see below |

## Response headers the server must send

**These cannot be set from this codebase, and a `<meta http-equiv>` tag
does not work for them — browsers ignore `X-Frame-Options` and
`frame-ancestors` in meta entirely. They must be real response headers
on the HTML document, configured wherever the SPA is served.**

```
Content-Security-Policy: default-src 'self';
  script-src 'self' 'sha256-NuAThATVjaaF19uzh1hbfv6Hp+EVbvHjj5dqyPXlSe0=';
  style-src 'self';
  img-src 'self';
  font-src 'self';
  connect-src 'self';
  frame-ancestors 'none';
  form-action 'none';
  base-uri 'none';
  object-src 'none'
X-Frame-Options: DENY
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
```

### Why `frame-ancestors 'none'` is load-bearing and not hardening

Signing keys are server-held: the server signs on an authenticated
admin's behalf. So a click an admin did not intend produces a
**genuine, correctly-signed approval**, and the hash chain records it as
valid. The chain proves a record was not changed quietly; it cannot prove
a click was meant.

That makes framing the one attack this product's core mechanism
structurally cannot detect. An attacker frames the approvals route under
a decoy control, an authenticated committee member clicks it, and the
ledger moves. Against the two-person tier — treasurer and secretary,
both — two framed clicks defeat "no single admin moves the ledger
alone," which is the invariant the entire approval design exists to
hold.

The approval button is inert at present (`type="button"`, no handler), so
there is no live exploit today. The requirement is recorded here because
it must be in place **before** that handler is wired, not after: a design
that specifies an approval control without specifying that it cannot be
framed has specified half a control.

`form-action 'none'` belongs with it. The login route posts
(`method="post"`), and without that directive an injected form target
could carry credentials off-origin. `Referrer-Policy: no-referrer` keeps
paths like `/ledger/<entryId>` out of referrer headers; no authenticated
screen makes a third-party request and the fonts are self-hosted, so
nothing in the app needs a referrer sent anywhere.

### The CSP hash drifts silently

`script-src` pins the SHA-256 of the one inline script in
`index.html` — the theme script that must run before first paint so a
dark-mode resident does not get a white flash. **One changed character
in that script changes the hash, the browser blocks the script, and the
flash returns with nothing failing.**

So: whenever that script changes, run `npm run csp-hash` and hand the new
value over in the same change. The script reads the built `dist/index.html`
rather than the source, because a build that rewrote the block would
otherwise produce a valid-looking hash for a page that gets blocked.

## Two strings that must never be renamed

Both are storage keys read by code that cannot import a shared constant.

- **`'cf-theme'`** — written in `src/lib/theme.ts` *and* in the inline
  script in `index.html`. The script runs before any module, so the two
  cannot share a definition. Rename one and a dark-mode resident gets a
  white flash on every load; nothing errors.
- **`'cf-locale'`** — `src/lib/i18n.ts`. A rename silently resets every
  resident to English, and the old value sits in their browser forever.

## What this codebase does not do

- **No money arithmetic.** `src/lib/money.ts` formats and parses; it does
  not add, subtract or total. Amounts are an integer count of the
  currency's minor units beside an ISO 4217 code, and a balance shown to
  a resident is the one the server derived from the chain — never one
  re-derived here from rows that might be a page short. A silently wrong
  total is worse than a crash: ₹12.50 stored as ₹0.125 is a plausible
  amount that will not look wrong to anyone.
- **No credentials, no `.env`.** Keys are server-held; there is nothing
  in this lane to leak.
- **No signing.** The frontend holds no key material.

## Sample data and the cutover

Every route reads its data from `src/lib/devData.ts`, which resolves to
the sample fixture in development and to an empty module in a production
build. The swap is a resolver alias in `vite.config.ts`, not an
`import.meta.env.DEV` branch — a branch cannot remove an import, because
the statement is hoisted before the dead branch is dropped, so the module
stays in the graph and its strings stay in the chunk.

`npm run fixtures` greps the built output and fails if any fixture string
survives, so this is verified rather than assumed. It caught the leak it
was written for on its first run: thirteen routes imported the fixture
directly, and because they are separate lazy chunks sharing one module,
the bundler hoisted the whole fixture into the **entry** chunk that every
role — including a signed-out visitor at `/login` — downloads before
anything renders.

In production those accessors return the honest absent value: an empty
list, or an anchor state of `unreachable`. The dashboard payload returns
`null`, because every field of it is required and none has a safe empty
value — a zero balance is a financial claim about the society's money.
The route renders each band's retry state instead.

`devData.ts`, `devData.source.ts`, `devData.empty.ts` and `sample.ts` are
all deleted at cutover; each accessor becomes the query that replaces it.

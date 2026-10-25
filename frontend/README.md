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
| `npm run budget` | A chunk over its gzip ceiling, set just above the measured baseline so a careless import trips it |
| `npm run csp-hash` | Prints the SHA-256 of the inline theme script for the CSP, read from the built output — see below |

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

### The dev server cannot satisfy that policy on its own

The policy above is strict on purpose: no `'unsafe-inline'` in
`script-src` or `style-src`. A production build earns that. It emits a
real `.css` file loaded by a `<link>`, and the one inline script is
allowed by its SHA-256.

The dev server does none of that. It serves every stylesheet as a JS
module that injects a `<style>` tag at runtime, and it adds inline
scripts of its own for react-refresh. Under the production policy the
browser refuses all of them, and the failure is quiet in the worst way:
**the app renders completely, with live data, and completely unstyled** —
browser-default serif, blue underlined links, bulleted navigation, and
visually-hidden text showing because `sr-only` never applied. There is no
build error and nothing in the terminal. The only signal is `Refused to
apply inline style` in the browser console.

So `vite.config.ts` adds a **nonce** for the dev server, not a keyword:

- `html.cspNonce` is Vite's own support. It injects
  `<meta property="csp-nonce">` for the HMR client to read, and stamps the
  nonce onto every script, style and stylesheet link in the served HTML.
- A dev-only plugin adds that same `'nonce-...'` to `script-src` and
  `style-src` in the **served** HTML. `apply: 'serve'` keeps it out of
  `build`, so `preview` and production serve the hash-only policy with no
  nonce in it, and `npm run csp-hash` is unaffected.

**`'unsafe-inline'` in dev would be the wrong fix**, which is why it is
not there. It makes dev and production run under different policies, so a
genuine CSP violation introduced in a component passes locally and fails
for a resident — the dev server stops being a test of the policy at all. A
nonce keeps one policy shape in both modes: inline content is allowed only
when it carries a secret the dev process generated.

Two things about it are load-bearing, and `src/lib/csp.test.ts` asserts
all of it, because the config typechecks and the build passes either way:

- **The nonce is generated fresh per server start.** A nonce written as a
  literal in the config is a constant sitting in a committed,
  world-readable file, which anything injected into the page could read
  and carry — `'unsafe-inline'` with extra steps.
- **Vite stamps the nonce onto the inline theme script too**, changing its
  bytes and so its SHA-256. That is safe only because a nonce match
  satisfies `script-src` on its own. The hash stays in the header,
  unchanged, for production, and the source `index.html` is never edited —
  editing it would change the value handed to the backend lane.

A note on `npm run preview`: it serves the strict hash-only policy
correctly, but it is also the fixture-free build, so every band shows its
retry state there. That is expected. `npm run dev` is the only mode that
shows sample data.

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

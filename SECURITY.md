# Security policy

ClearFunds holds a housing society's expense record. A defect here does not
leak a hobby project's data — it misstates what a committee collected and
spent, in front of the residents who paid it. Reports are welcome and will be
read.

## Reporting a vulnerability

**Open a [private security advisory][advisory].** That is the only channel
that does not publish the report while the defect is live.

[advisory]: https://github.com/PratikKothari34/ClearFunds/security/advisories/new

Please do **not** open a public issue for a vulnerability. Blank issues are
disabled and every template is public, so there is no way to file one
privately through the issue tracker.

If the advisory form is unavailable to you, open a public issue that says only
that you have a security report and gives no detail, and a maintainer will
arrange a private channel.

## What to expect

Both maintainers are volunteers on this project, so a reply may take days
rather than hours.

- **Acknowledged within 7 days.** If you have heard nothing after that, assume
  the report was missed and say so on the advisory.
- **An assessment within 30 days** — whether it is a defect, how serious, and
  what the fix looks like.
- **Credit in the advisory and in [`COPYRIGHT`](COPYRIGHT)** unless you ask us
  not to.
- **No bounty.** There is no money in this project.

Please give us a reasonable chance to ship a fix before publishing. We will
not ask you to stay quiet indefinitely, and we will not dispute your right to
disclose a defect we have left unfixed.

## What is in scope

The repository: the React frontend under `frontend/`, the Supabase backend
under `backend/`, the contracts under `contracts/`, and the CI workflows.

**In scope, and most valuable:**

- Anything that lets a ledger entry be **changed or removed without leaving
  evidence** — a break in the hash chain, a reversal that does not reference
  what it reverses, an entry that renders as something other than what was
  signed.
- Anything that lets **one admin move the ledger alone** — an approval tier
  that reduces to a single person, an approval counted against a limit other
  than the one in force when it was made.
- **A resident seeing another flat's data**, or an unauthenticated reader
  seeing any of it.
- **Money arithmetic in the frontend**, or anywhere a figure is computed from
  something other than the signed record.
- **A screen that states a figure it cannot support** — a count that
  contradicts the rows beside it, a stale check presented as a current pass, a
  failed read drawn as an empty result.
- Authentication and session handling, including OTP flows.
- Secrets or credentials committed to the repository, current or historical.

## What is not a vulnerability

These are known, documented properties of the design, not oversights:

- **The server holds the signing keys and can therefore forge an entry.** This
  is stated plainly in the [README](README.md) and is why the product claims
  *tamper-evident*, never *tamper-proof*. The defence is that a forgery cannot
  be made **quietly**: the chain head is published monthly to a repository the
  committee does not control, and residents' own software fetches it directly.
  A report that the operator could forge an entry describes the threat model.
  A report that a forgery would **not be detectable** is a real finding — send
  that one.
- **The deployed build is not a public demo.** It authenticates against a real
  project. Finding that you cannot get in without an account is the intended
  behaviour.
- **Demo sign-in buttons** are gated on a dev-only build flag and a separate
  environment variable, and a build check asserts they are absent from every
  shipped asset. If you find them in a production bundle, that *is* a report.
- The local demo's Supabase keys (`backend/scripts/seed.ts`) are the Supabase
  CLI's published local-development tokens. They grant nothing beyond a
  container on your own machine.
- Missing security headers on a URL that is not the production deployment.
- Automated scanner output with no demonstrated impact. Tell us what an
  attacker gets, not what a tool flagged.

## Supported versions

There is no release series yet. **`main` is the supported version**, and a fix
lands there. Deployments track `main`; a merge is not a deployment, so a fix is
live only once the deployed build carries it.

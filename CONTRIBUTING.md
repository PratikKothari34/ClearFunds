# Contributing to ClearFunds

Two people and one repository. This file is the working agreement: who touches
what, how work is tracked, and how a change reaches `main`.

| Person | GitHub | Lane |
|---|---|---|
| Pratik V Kothari | `@PratikKothari34` | **Frontend**, all of it. Repository owner and admin |
| Prem Prateek Tadinada | `@tadiPro250` | **Backend**, all of it |

Two rules outrank everything below:

1. **You own one lane, and you do not build in the other.** If you need
   something from the other side, state the contract you need and raise it
   (§2.2). Two implementations of the same boundary are worse than a blocked
   branch.
2. **Nothing reaches `dev` or `main` on one person's say-so.** That includes
   the repository admin. The product exists so that no single admin can move
   the ledger alone. A repository where one of its two maintainers can merge
   alone fails that same test, so we hold ourselves to it (§3.4).

The product rules that bind the code itself are in [`AGENTS.md`](AGENTS.md)
under "Before you change anything" and in [`docs/GOALS.md`](docs/GOALS.md).
This file does not repeat them. Read them before your first PR.

---

## 1. The repository tree

```
ClearFunds/
├── .github/            CODEOWNERS, PR + issue templates, rulesets of record, CI (when it exists)
├── frontend/           React + TypeScript on Vite, TanStack Router + Query      → Pratik
├── backend/            server, schema, migrations, signing, chain, reports       → Prem
├── contracts/          the boundary: API spec, chain preimage spec, test vectors → both
│   └── CHANGELOG.md    append-only log of every contract change
├── docs/
│   ├── GOALS.md        what the product is for, and the open questions           → both
│   ├── decisions/      one file per load-bearing decision                        → both
│   ├── frontend/       frontend-only design notes, if any                        → Pratik
│   └── backend/        backend-only design notes, if any                         → Prem
├── AGENTS.md  CONTRIBUTING.md  README.md                                         → both
└── LICENSE  COPYRIGHT  .gitattributes  .gitignore                                → both
```

`frontend/` exists. `backend/` and `contracts/` do not yet — **each is created
by its owner's first PR.** Nobody creates a placeholder in the other person's
lane, and that includes empty directories and READMEs.

### 1.1 Owners by path

"Owner" means: they author it, they decide its internals, and they answer for
it. `.github/CODEOWNERS` is the machine-readable copy of this table. If the
two disagree, fix CODEOWNERS in its own PR.

| Path | Owner | Who must approve a PR touching it |
|---|---|---|
| `frontend/**` | Pratik | Prem (the other person, §4.2) |
| `backend/**` | Prem | Pratik (the other person, §4.2) |
| `contracts/**` | **Both** | Both: author + reviewer, and it is always its own PR (§6) |
| `docs/GOALS.md`, `docs/decisions/**` | **Both** | Both |
| `docs/frontend/**` | Pratik | Prem |
| `docs/backend/**` | Prem | Pratik |
| `AGENTS.md`, `CONTRIBUTING.md`, `README.md` | **Both** | Both |
| `.github/**` (templates, CODEOWNERS, rulesets, workflows) | **Both** | Both |
| `.gitignore`, `.gitattributes`, `COPYRIGHT` | **Both** | Both |
| `LICENSE` | Nobody | **Never edited.** Verbatim GPL-3.0; contributors go in `COPYRIGHT` |

### 1.2 Every Markdown file, and who keeps it true

| File | Owner | Changes when |
|---|---|---|
| `AGENTS.md` | Both | A settled rule changes, or the orientation for agents goes stale |
| `CONTRIBUTING.md` | Both | The way we work changes. Edit it instead of agreeing in chat |
| `README.md` (root) | Both | Created once both stacks run. It holds setup for the whole repo and links to the two lane READMEs |
| `docs/GOALS.md` | Both | An open question is settled or a new one is raised |
| `docs/decisions/README.md` and entries | Both | A load-bearing decision is made (§5.4) |
| `frontend/README.md` | Pratik | How to run, build and test the frontend changes |
| `backend/README.md` | Prem | How to run, migrate and test the backend changes |
| `contracts/README.md` | Both | A new kind of contract file is introduced |
| `contracts/CHANGELOG.md` | Both | **Every** contract PR appends exactly one line (§6) |
| `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/*.md` | Both | The process in this file changes |
| Anything `.gitignore` excludes | Each person's own copy | Never committed, so **nothing committed may depend on one.** If a doc, script or test needs it, it does not work from a clean clone |

A lane README is part of that lane's definition of done (§7). If your PR
changes how your side runs, the README changes in the same PR.

---

## 2. Staying in your lane

### 2.1 The rule

You only author changes in your own lane and in the shared paths. **You never
author behaviour in the other person's lane.** That covers endpoints, screens,
migrations, signing, chain verification, report rendering, money handling and
copy.

### 2.2 What to do instead

| You need | Do this |
|---|---|
| A new endpoint, field or error case | Open a **contract request** issue against the other person (§5.2). Name the endpoint, the payload shape and the error cases |
| To start now, before the other side exists | Code against the contract and its fixtures in `contracts/`. That is what they are for. Never write a stub of the other side in your own lane |
| A bug you found in the other lane | Open a **bug** issue in their lane. Do not fix it yourself |
| A typo in the other person's README | Open the PR. It is one click for them to approve |
| Something the product rules have not settled | Open a **decision** issue (§5.4). Do not pick a default in code |

### 2.3 The escape valve

You may touch the other lane **only** for a minimum mechanical change that
your own merged change forced, such as a renamed import or a call-site
update. Then:

1. Start the PR description with `crosses-boundary:` and the reason.
2. Keep it mechanical: no behaviour, no copy, no number, no money arithmetic,
   no hash or signing logic.
3. The owner of that lane reviews it. This is the normal rule; the escape
   valve does not skip it.

If the change is not mechanical, it is not an escape-valve change. Split it:
your part in your PR, and their part as an issue assigned to them.

**Never through the escape valve:** `backend/` migrations, anything that
produces or checks a chain hash or signature, and `contracts/**`.

---

## 3. Branches

### 3.1 Model

```
<area>/<issue>-<slug>   ->   dev   ->   main
   your branch          integration   released
```

- **Work happens on a short branch cut from `dev`.** `git switch dev && git pull && git switch -c backend/2-chain-preimage`.
- **PRs target `dev`.** Squash-merged.
- **`main` only ever receives `dev`**, through a promote PR (§3.5). No feature
  branch and no hotfix targets `main` directly. An urgent fix goes to `dev`
  first and is promoted straight away, so the path stays the same and only
  the timing changes.
- **Nobody commits directly to `dev` or `main`.** Both are PR-only, enforced
  by the rulesets in §3.4.
- **`dev` is the default branch.** A clone lands on it, new PRs target it, and
  `Closes #N` works. GitHub only auto-closes an issue when the PR merges into
  the default branch.

### 3.2 Names

```
<area>/<issue-number>-<short-slug>
```

`<area>` is one of exactly these, which double as future CI path-filter keys:

`frontend` · `backend` · `contracts` · `docs` · `chore`

```
backend/2-chain-preimage-spec
contracts/2-chain-test-vectors
frontend/14-ledger-list
docs/3-auditor-reason-decision
chore/9-ci-skeleton
```

Not: `feature/new-stuff`, `prem-branch`, `fix`, `dev2`.

### 3.3 Lifetime

**A branch lives at most 3 days and changes at most 400 lines** (lockfiles
and test vectors excluded). If it needs more, split the issue. A long branch
in a two-person repo has nobody to rebase it against except the other
person's week of work.

You may stack a branch on your own unmerged branch **within your own lane**.
Never stack on the other person's branch.

### 3.4 Protections, and what is actually configured

The rulesets of record are in `.github/rulesets/`. **Only the repository
admin (Pratik) can apply them.** Until they are applied, the live
configuration is the existing `main protection` ruleset, and this section
describes the target state.

| Setting | `dev` | `main` |
|---|---|---|
| PR required | yes | yes |
| Approving reviews | 1 (the other person) | 1 (the other person) |
| Stale approvals dismissed on push | yes | yes |
| All review threads resolved | yes | yes |
| Allowed merge method | **squash only** | **merge commit only** (promotes) |
| Linear history | yes | no (the promote merge commits are the history) |
| Force push / deletion | blocked | blocked |
| Required status check | `ci-ok`, once CI exists | `ci-ok`, once CI exists |
| **Bypass list** | **empty, including the admin** | **empty, including the admin** |

Why each of these is set the way it is:

- **Code-owner review is off on purpose.** GitHub never lets the author
  approve their own PR. With two people, "1 approval" already means "the
  other person", in every lane. If code-owner review were on, a PR in your
  own lane would wait for an approval from you, which can never arrive.
  CODEOWNERS is still committed: it auto-requests the owner when someone
  crosses into their lane, and it is the ownership table of record.
- **`main` is merge-commit only, and `dev` is squash only.** GitHub's
  "rebase and merge" always rewrites commits. If promotes were rebased, `main`
  and `dev` would stop sharing history after the first promote, and every
  later promote would conflict with itself. A merge commit keeps `dev` an
  ancestor of `main`. It also makes `git log --first-parent main` read as a
  list of releases.
- **The bypass list is empty.** See rule 2 at the top of this file.

**Applying it (admin only, once).** Run these after this file merges:

```bash
R=PratikKothari34/ClearFunds
# 1. Create dev from main and make it the default branch
gh api -X POST repos/$R/git/refs -f ref=refs/heads/dev -f sha=$(gh api repos/$R/git/ref/heads/main -q .object.sha)
gh repo edit $R --default-branch dev
# 2. Replace the existing main ruleset (id 25568002) and add dev's
gh api -X PUT  repos/$R/rulesets/25568002 --input .github/rulesets/main.json
gh api -X POST repos/$R/rulesets          --input .github/rulesets/dev.json
# 3. Labels (§5.3). Only the ones GitHub does not create by default:
#    `bug` and `documentation` already exist on a new repo — reuse them
#    rather than adding a second label that means the same thing.
for l in "frontend:1d76db" "backend:5319e7" "contract:fbca04" "decision:0e8a16" \
         "blocked:b60205" "chore:c5def5"; do
  gh label create "${l%%:*}" --color "${l##*:}" -R $R --force; done
```

Run steps 1 and 2 together. Between them, the old ruleset follows the
default branch to `dev` and leaves `main` unprotected. After applying, check
that a direct push to `dev` is rejected from both accounts.

### 3.5 Promoting `dev` to `main`

Either person opens it, and the other approves. Every condition must hold:

- `ci-ok` is green on `dev`, once CI exists
- both stacks run from a clean clone of `dev` following the READMEs
- no PR into `dev` is mid-review with changes requested
- every contract change since the last promote is in `contracts/CHANGELOG.md`

The PR goes from `dev` into `main`, with the title `promote: <one line on what
shipped>`. Merge it with **Create a merge commit**. Then tag it:

```bash
git switch main && git pull
git tag -a v0.<n>.0 -m "<one line on what shipped>" && git push origin v0.<n>.0
```

If a promote conflicts, something reached `main` without going through `dev`.
Fix that first; resolving the conflict alone leaves the cause in place.

---

## 4. Pull requests

### 4.1 Size

| Limit | Number |
|---|---|
| Changed lines, excluding lockfiles and test vectors | **≤ 400** |
| Lanes touched | **1**. Shared docs may ride along. `contracts/` never does (§6) |
| Age at merge | **≤ 3 days** |

### 4.2 Who reviews, and what for

**The reviewer is always the other person**, so request them explicitly.
GitHub does not auto-request anyone for a PR in your own lane (§3.4).

Reviewing the other person's lane is not a style review. The owner decides
their internals. As reviewer you block only on:

1. **The contract.** Does it produce or consume exactly what `contracts/`
   says, with the same field names, the same errors and the same integer
   money?
2. **The settled rules in `AGENTS.md`.** Look for:
   - any path that edits or deletes a ledger entry
   - floating-point money
   - a report or balance re-derived in the client
   - live config read where the chain holds a snapshot
   - "tamper-proof", "immutable", "certified" or "verified" in copy
3. **Correctness you can demonstrate**, meaning a failing case and not a
   preference.

Mark everything else `nit:`. A nit never blocks, and the author may ignore it.

### 4.3 Review response time

| Situation | Rule |
|---|---|
| PR opened | **First response within 24 h.** That is an approval, a change request, or "on it, by Thursday". Silence is not a response |
| No response after 48 h | Ping in chat with the PR link |
| No response after 72 h | Still no merge. The author keeps working on the next issue, stacked if it is in their own lane |

There is no backup reviewer and no terminal "admin merges it" rule. With two
people, either of those would mean one person moving the repository alone,
which rule 2 rules out. Short branches (§3.3) are what make waiting cheap.

### 4.4 Merging

- **The author merges** once it is approved, CI is green and threads are
  resolved. The reviewer approves but does not merge, so the author stays
  responsible for when the change lands.
- **Squash title = a conventional commit** (§5.5), ending in `(#PR)`. GitHub
  appends the PR number by default; keep it.
- `Closes #N` only when every "Done when" item on that issue is done.
  Otherwise use `Part of #N`, and write on the issue what is left.

---

## 5. Issues

### 5.1 Every change starts from an issue

No branch without an issue, and the issue number is in the branch name. This
applies to both lanes. Reading the repository is not an assignment.

- **One issue, one owner.** The assignee is the person who will do it, which
  is the lane owner for lane work.
- **Claim it in a comment** ("Taking this.") **and self-assign** before you
  start. An unclaimed issue is not being worked on, whatever its assignee
  says.
- **Anyone may open an issue in either lane.** The lane owner may push back
  on scope in the thread, and the thread is where it gets settled, not in a
  PR.
- **An issue that grows a second deliverable gets split.** Anything outside
  the stated scope is a separate issue.

### 5.2 The four issue types

Pick a template; blank issues are disabled.

| Template | Use it for | Label |
|---|---|---|
| **Work item** | Planned work in one lane | `frontend` or `backend` |
| **Contract request** | One side needs something across the boundary: endpoint, payload, error cases, a spec | `contract` + the lane that will **produce** it |
| **Decision** | A load-bearing question that `AGENTS.md`/`GOALS.md` leave open | `decision` |
| **Bug** | Something behaves wrongly | `bug` + the lane it is in |

A contract request is written **as a contract, not as an implementation
request.** Issues #1–#3 are the model to follow: what the requester needs,
what they verified, and the traps.

### 5.3 Labels

Only these. The GitHub defaults (`enhancement`, `good first issue` and the
rest) are not used.

| Label | Meaning |
|---|---|
| `frontend` | Lane: Pratik |
| `backend` | Lane: Prem |
| `contract` | Changes or needs something in `contracts/`. Both people review |
| `decision` | Settles an open question. Closes with a docs PR (§5.4) |
| `bug` | Behaves wrongly. A wrong balance or a false "verified" is the worst kind |
| `blocked` | Cannot proceed without the other person. See §5.6 |
| `documentation` | Shared documentation only. GitHub's own label — there is no separate `docs` label, so an issue is not mislabelled by picking the wrong one of two |
| `chore` | Tooling, CI, repo housekeeping |

### 5.4 Decisions

1. Discuss it in the decision issue. The person whose lane carries the cost
   proposes, and the other accepts, amends or rejects. A product or privacy
   call that is neither lane's goes to the repository owner.
2. **A decision issue closes only with a merged PR** that writes the outcome
   down. That means `docs/GOALS.md` (open question → settled, with the date),
   `AGENTS.md` if it binds code, and a `docs/decisions/NNNN-*.md` entry if it
   is load-bearing per [`docs/decisions/README.md`](docs/decisions/README.md).
3. A decision that lives only in an issue thread or in chat has not been
   made.

### 5.5 Commits

Your own branch can say `wip` forty times. Only the squash title lands on
`dev`, so that is the one place the format matters:

`feat` · `fix` · `refactor` · `docs` · `test` · `chore` · `perf`, with scope
`frontend` · `backend` · `contracts` · `docs` · `ci`.

```
feat(backend): append-only ledger_entry table with sequence and format_version
docs(contracts): canonical entry preimage with two-entry worked example
fix(frontend): render reversed entries in the period total
```

Also, from `AGENTS.md`:

- **No `Co-authored-by` trailer and no agent attribution**, in commits or in
  PR descriptions. Coding agents add these automatically, so strip them.
- No absolute paths from your machine in commit messages.

### 5.6 Blocked

Within the hour you notice:

1. Open an issue titled `BLOCKED: <what you need> — from <person>`, labelled
   `blocked` and the lane it is needed from, and assigned to that person.
2. Write **one sentence** naming the smallest thing that unblocks you. That
   is usually a contract or a test vector, not an implementation.
3. Send the link in chat. An issue nobody has been told about is not an
   escalation.

Then work around it, never through it: code against the contract, and pick up
your next issue. If 48 hours pass with no committed date, it becomes the top
item the next time you both sync.

---

## 6. Changing a contract

A contract is any file under `contracts/`. Both implementations are built
against it, so changing it moves the ground under the other person.

**Rules:**

1. **Its own PR, never bundled with the implementation that needs it.** In a
   300-line backend PR, the 4-line payload change that breaks the frontend
   gets skimmed. As its own PR, everyone reads it.
2. **Merged before either implementation PR that depends on it opens.** The
   implementation PRs reference it.
3. **The PR contains exactly:**
   - the spec change: OpenAPI, JSON Schema, or the prose spec for the chain
     or the anchor
   - fixtures and **test vectors**. For anything hashed or signed, a worked
     example with exact preimage bytes in hex and the resulting hash. Both
     implementations must reproduce these byte for byte, so they are the
     real definition of the contract
   - one appended line in `contracts/CHANGELOG.md`:
     `2026-10-23 | chain-entry.v1 | ADD preimage spec | #2 | new`
4. **Additive within a version.** A breaking change ships as a new version
   alongside the old one, such as `entry.v2` next to `entry.v1`. Anything
   that sits in a hash preimage is **never** changed in place. It gets a new
   `format_version`, and old entries keep verifying under the old rules.
5. **Who writes it:** the producing side drafts the change and the consuming
   side approves. The backend produces almost every contract here, so Prem
   usually authors and Pratik reviews. Either may propose a draft in the
   issue first, as #1 did.

---

## 7. Definition of done

A PR is done when **all** of these hold. Working code alone does not count.

- [ ] It changes one lane you own plus shared docs, or §2.3 was followed.
- [ ] `ci-ok` is green, once CI exists. Until then, the PR states the
      commands you ran and their output.
- [ ] There is a test that **fails if the logic is removed**. For money,
      chain or approval logic it includes the negative case, such as a
      rejected second reversal or a mismatched hash.
- [ ] Nothing contradicts the settled items in `AGENTS.md`. The ones most
      easily broken: no edit or delete path on entries, no float money, no
      live config where the chain holds a snapshot, and the
      `tamper-evident` / `reasonable assurance` wording.
- [ ] It conforms to `contracts/` exactly, and if it is hashed, it reproduces
      the test vectors.
- [ ] The lane README still describes how to run it.
- [ ] No secrets. This repository is public, and a pushed secret is public
      permanently.
- [ ] `Closes #N` only if every "Done when" item is done; otherwise
      `Part of #N`.

---

## 8. Conflict avoidance

- **Rebase your branch on `dev`**, never merge `dev` into it:
  `git pull --rebase origin dev`, then `git push --force-with-lease` to
  **your own branch only**.
- **Lockfiles** (`package-lock.json`/`pnpm-lock.yaml` in `frontend/`, and
  whatever the backend stack uses in `backend/`) belong to their lane owner.
  On conflict, take `dev`'s copy and regenerate it. Never resolve one by
  hand.
- **Line endings** are set by `.gitattributes` (LF everywhere; CRLF for
  `.ps1`, `.cmd` and `.bat`). Do not override it.
- **Shared files** (`AGENTS.md`, `GOALS.md`, this file) conflict the most,
  so change them in small, separate docs PRs. Do not carry them inside a
  lane PR for a week.

---

## 9. CI, when it lands

Nothing to run yet. When the first stack lands:

- One workflow, `.github/workflows/ci.yml`, with path-filtered jobs
  `frontend`, `backend` and `contracts`, plus a single aggregator job
  **`ci-ok`** that is the only required check. A skipped path-filtered job
  marked required stays pending forever and blocks the merge.
- The `contracts` job runs **both** implementations against the test vectors.
  That is the check that catches the two sides drifting apart.
- The PR that adds CI also adds `ci-ok` to both rulesets (§3.4).

---

## 10. Using a coding agent

Point it at [`AGENTS.md`](AGENTS.md) first, then this file. Agents are bound
by the same lanes. An agent working for the backend owner does not write
frontend code to unblock itself; it writes the contract request. Strip any
attribution trailer it adds (§5.5).

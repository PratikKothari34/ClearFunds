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
2. **Nothing reaches `main` on one person's say-so.** That includes
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
├── backend/            Supabase: migrations, the edge function, the pgTAP suite  → Prem
├── contracts/          the boundary: API spec, chain preimage spec, test vectors → both
│   └── CHANGELOG.md    append-only log of every contract change
├── docs/
│   ├── GOALS.md        what the product is for, and the open questions           → both
│   ├── decisions/      one file per load-bearing decision                        → both
│   └── design/         the frontend design                                       → Pratik
├── AGENTS.md  CONTRIBUTING.md  README.md                                         → both
└── LICENSE  COPYRIGHT  .gitattributes  .gitignore                                → both
```

All three lanes exist. **Nobody creates a placeholder in the other person's
lane**, and that includes empty directories and READMEs.

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
| `docs/design/**` | Pratik | Prem |
| `AGENTS.md`, `CONTRIBUTING.md`, `README.md` | **Both** | Both |
| `.github/**` (templates, CODEOWNERS, rulesets, workflows) | **Both** | Both |
| `.gitignore`, `.gitattributes`, `COPYRIGHT` | **Both** | Both |
| `LICENSE` | Nobody | **Never edited.** Verbatim GPL-3.0; contributors go in `COPYRIGHT` |

### 1.2 Every Markdown file, and who keeps it true

| File | Owner | Changes when |
|---|---|---|
| `AGENTS.md` | Both | A settled rule changes, or the orientation for agents goes stale |
| `CONTRIBUTING.md` | Both | The way we work changes. Edit it instead of agreeing in chat |
| `README.md` (root) | Both | What the product is, or how the two lanes fit together, changes. It links to the two lane READMEs rather than repeating them |
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
<area>/<issue>-<slug>   ->   main
   your branch          released
```

- **Work happens on a short branch cut from `main`.** `git switch main && git pull && git switch -c backend/2-chain-preimage`.
- **PRs target `main`**, and are squash- or rebase-merged. `main` enforces
  linear history, so a merge commit cannot land.
- **Nobody commits directly to `main`.** It is PR-only, enforced by the
  ruleset in §3.4.
- **`main` is the default branch**, so `Closes #N` works: GitHub auto-closes
  an issue only when the PR merges into the default branch.

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

### 3.4 Protections

Live on `main`, ruleset "main protection":

| Setting | `main` |
|---|---|
| PR required | yes |
| Approving reviews | 1 (the other person) |
| Stale approvals dismissed on push | yes |
| All review threads resolved | yes |
| Allowed merge method | **squash or rebase** |
| Linear history | **enforced**, so a merge commit cannot land |
| Force push / deletion | blocked |
| Required status check | `ci-ok`, once CI exists |
| Bypass list | the Admin repository role |

- **Push before asking for review, not after.** A new push dismisses existing
  approvals.
- **Code-owner review is off on purpose.** GitHub never lets the author
  approve their own PR, so with two people "1 approval" already means "the
  other person", in every lane. With code-owner review on, a PR in your own
  lane would wait for an approval from you, which can never arrive. CODEOWNERS
  is still committed: it auto-requests the owner when someone crosses into
  their lane, and it is the ownership table of record.
- **The Admin role can bypass, and does not.** That is how a direct push to
  `main` can succeed at all; such a push prints
  `remote: Bypassed rule violations for refs/heads/main` **on success**, which
  is the bypass working, not a rejection. Rule 2 at the top of this file is
  why it is not used. A collaborator has no bypass.

The ruleset of record is `.github/rulesets/main.json`, a transcription of the
live rule — a record, not the mechanism. **Only the repository admin (Pratik)
can change it.** Verify the live state at any time with
`gh api repos/PratikKothari34/ClearFunds/rulesets`.

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
`main`, so that is the one place the format matters:

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

- **Rebase your branch on `main`**, never merge `main` into it:
  `git pull --rebase origin main`, then `git push --force-with-lease` to
  **your own branch only**. Rewriting history that is already pushed needs the
  branch owner's go-ahead first.
- **Lockfiles** (`package-lock.json` in `frontend/`, and whatever the backend
  stack uses in `backend/`) belong to their lane owner. On conflict, take
  `main`'s copy and regenerate it. Never resolve one by hand.
- **Line endings** are set by `.gitattributes`: LF everywhere, CRLF for
  `.ps1`, `.cmd` and `.bat`, and `binary` for fonts, images and documents so
  git never rewrites their bytes. Do not override it. If you add a binary
  file type, declare it there rather than relying on `text=auto` to guess -
  the guess is per file and a wrong one corrupts the file silently.
- **Shared files** (`AGENTS.md`, `GOALS.md`, this file) conflict the most,
  so change them in small, separate docs PRs. Do not carry them inside a
  lane PR for a week.

---

## 9. CI

**`.github/workflows/ci.yml` runs on every pull request and every push to
`main`.** Its jobs are path-filtered:

- **`frontend`:** `npm run verify`, the same gate you run locally. It
  typechecks with `tsc -b`, lints, runs the test suite, builds, and then runs
  the repository's own checks for shadowed utility classes, sample data
  leaking into the bundle, the gzip bundle budgets and the inline-script CSP
  hash.
- **`backend`:** every pgTAP file against a database built from the
  migrations alone, then the edge function's Deno tests.
- **`contracts`:** **both** implementations against the test vectors. That
  is the check that catches the two sides drifting apart.

One aggregator job, **`ci-ok`**, passes when every job that ran passed. It is
the only check to require: a skipped path-filtered job marked required stays
pending forever and blocks the merge. Requiring it on `main` is a change to
the live ruleset, so it is applied by the repository owner once `ci-ok` has
been seen green (`.github/rulesets/README.md`, *Pending*). Until then the
gate is still yours to run before opening a pull request. A red result is
reported, not committed around.

---

## 10. Using a coding agent

Point it at [`AGENTS.md`](AGENTS.md) first, then this file. Agents are bound
by the same lanes. An agent working for the backend owner does not write
frontend code to unblock itself; it writes the contract request. Strip any
attribution trailer it adds (§5.5).

### 10.1 Wire the guard, or it is decoration

[`.claude/hooks/guard.py`](.claude/hooks/guard.py) denies four things from a
command line before the command runs: an attribution trailer in a commit
message (§5.5), an absolute system path in a commit message, a push whose
refspec targets `main` (§3), and content piped through a heredoc. It is in
the repository; **the config that runs it is not**, because it is per-machine
and is deliberately untracked. A fresh clone therefore has the script and no
hook, which looks installed and guards nothing.

If your agent reads Claude Code settings, add this to
`.claude/settings.local.json` yourself:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          { "type": "command", "command": "python3 \"${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.py\"", "onFailure": "block" }
        ]
      }
    ]
  }
}
```

**Use the interpreter your machine actually has, and check it before you paste
the block.** `python3` above suits macOS and Linux. On Windows use
`py -3.12`, because a bare `python` there is frequently a different install
from the one holding your packages. Either way, run
`<interpreter> .claude/hooks/guard.py` once by hand first and confirm it
starts — the next paragraph is why that one check matters.

`"onFailure": "block"` is not optional. Without it a guard that crashes —
a syntax error, a missing interpreter — **fails open**, and every call it was
meant to deny goes through while the hook still appears configured.

The two rules combine in a way worth knowing before it happens to you: with
`block` set, an interpreter that is not on your `PATH` does not merely leave
the guard uninstalled, it **denies every `Bash` and `PowerShell` call** the
matcher covers. That is the correct behaviour — a guard that cannot run must
not wave work through — but the symptom is a repository that appears broken
rather than one that appears unguarded, so verify the interpreter rather than
trusting the paste.

Use the absolute form above rather than a bare `.claude/hooks/guard.py`. An
agent's working directory moves — into `frontend/` to run the suite, into
`backend/` for a migration — and a relative path then resolves to nothing. A
hook whose script is missing is a hook failure, so with `onFailure` set it
denies every command until you notice, and without it guards nothing.

Check it on a command you expect to be denied, not on one you expect to pass:
a guard that allows everything and a guard that is not running are
indistinguishable from the passing side.

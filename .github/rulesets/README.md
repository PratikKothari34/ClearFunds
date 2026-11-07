# Rulesets of record

`main.json` records the branch protection that is **live on GitHub**, so the
rules travel with a clone and a change to them is reviewable like any other
change. `dev.json` is a prepared ruleset that has **not** been applied; each
file says which it is, because the difference is invisible from the JSON.

These files are a record, not the mechanism. Editing one protects nothing:
GitHub is the authority, and a ruleset changes only when it is applied through
the API or the web UI. Likewise, a rule can be changed on GitHub without
anyone touching these files, which is how the record drifts.

## `main.json` — live

Applied to the default branch, enforcement `active`. It is a verbatim
transcription of the live ruleset, reduced to the fields the API accepts for a
create or update: server-assigned fields (`id`, `created_at`, `_links`,
`source`, `node_id`, `current_user_can_bypass`) are not kept, because a file
carrying them cannot be fed back.

Three things in it are load-bearing and easy to get wrong:

- **`required_linear_history`** means a merge commit cannot land. That is why
  `allowed_merge_methods` is `squash` and `rebase` and **not** `merge` — the
  two settings have to agree, or every merge attempt is rejected at the end of
  a review rather than at the start.
- **`bypass_actors` holds `actor_id: 5`** (the Admin repository role,
  `bypass_mode: always`). The repository owner can therefore push to the
  default branch directly. Such a push prints
  `remote: Bypassed rule violations for refs/heads/main` **on success** — that
  line is the bypass working, not a rejection, so confirm the ref moved rather
  than reading the warning as a failure. Collaborators have no bypass, and
  their work goes through a pull request.
- **`~DEFAULT_BRANCH`** rather than a literal `refs/heads/main`. The rule
  follows the default branch if it is ever renamed, instead of silently
  protecting a branch that no longer exists.

## `dev.json` — not applied

A prepared ruleset for a `refs/heads/dev` branch. **Neither the branch nor the
ruleset exists on GitHub** — `gh api .../rulesets` returns `main protection`
alone — so nothing in this file protects anything today. It is kept because it
is where the protection for a `dev` branch is decided and reviewed before it is
applied, and because it carries the `ci-ok` required status check, which has to
agree with whatever the CI workflow actually names its aggregate job.

Two consequences of it being unapplied, both easy to misread:

- **`enforcement: "active"` in this file is a statement of intent, not a live
  state.** A ruleset that was never created enforces nothing regardless of what
  the field says.
- **It has no `bypass_actors`.** If it is ever applied, the owner gets no
  bypass on `dev` — deliberate, but it means a direct push to `dev` would be
  rejected outright rather than printing the bypass warning that `main` does.

## Verifying the record

```
gh api repos/PratikKothari34/ClearFunds/rulesets
gh api repos/PratikKothari34/ClearFunds/rulesets/<id>
```

Compare the result against the file. Note that a `PATCH` to a repository
settings endpoint can return `200` and change nothing when the feature is not
available on the plan, so confirm a write with a fresh read rather than
trusting the status code.

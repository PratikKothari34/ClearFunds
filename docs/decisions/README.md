# Decision log

Load-bearing decisions for ClearFunds. This directory is source of truth #2 —
`CLAUDE.md` outranks it, nothing else does.

## When to write an entry

Only when actually required. A decision earns an entry when reversing it later
would cost real rework: choice of stack, data model, money representation,
persistence, auth, a dependency that is hard to remove, a deliberate trade-off
someone will otherwise undo by accident.

Routine work does not earn an entry. Neither does a decision that the code
already states plainly.

## Format

One file per entry, `NNNN-kebab-title.md`, numbered in order from `0001`.

```markdown
# NNNN. Title

- **Date:** YYYY-MM-DD
- **Status:** proposed | accepted | superseded by [NNNN](NNNN-....md)

## Context

What forced the decision. Constraints that were real at the time.

## Decision

What was chosen, stated so it can be checked against the code.

## Consequences

What this makes easy, what it makes hard, and what it rules out.

## Alternatives rejected

Each one with the reason it lost.
```

## Rules

- Entries are append-only in spirit: supersede rather than rewrite. Mark the
  old entry `superseded by`, and link both ways.
- Numbers never get reused, even if an entry is withdrawn.
- A consolidated summary doc is a **read, not an authority** — it loses to
  these entries on decisions, and beats them on numbers.
- Every decision must be reflected here; a change recorded here can overwrite
  what was decided before.

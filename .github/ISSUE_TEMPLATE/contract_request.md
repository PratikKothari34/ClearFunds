---
name: Contract request
about: One side needs something across the boundary, such as an endpoint, a payload, error cases or a spec.
title: ""
labels: contract
assignees: ""
---

<!-- Also label it with the lane that will PRODUCE it, and assign that person.
     Write it as a contract, not as an implementation request. Issues #1-#3 are the model. -->

## What this is

<!-- What you are building, and why it needs this from the other side. -->

## The contract I need

<!-- Whichever apply:
     - endpoint and method, auth, request shape, response shape
     - every error case and what the client receives for each
     - for anything hashed or signed: exact fields, order, encoding, and a worked example with preimage hex and hash -->

## What I verified already

## Traps

<!-- The ways this goes wrong that the other side might not see from their lane. -->

## Done when

- [ ] The contract is merged in `contracts/` as its own PR, with test vectors and a `CHANGELOG.md` line
- [ ] Both implementations reference it

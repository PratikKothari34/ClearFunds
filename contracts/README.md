# Contracts

The boundary between `frontend/` and `backend/`. Both sides build against
these files. Neither side's code defines the contract.

| Path | What it defines |
|---|---|
| [`chain/entry-preimage.v1.md`](chain/entry-preimage.v1.md) | The exact bytes hashed for every chain entry, and how entries link |
| [`chain/vectors/`](chain/vectors/) | Test vectors. **Both implementations must reproduce them byte for byte** |
| [`chain/kinds/ledger.v1.md`](chain/kinds/ledger.v1.md) | Every ledger kind's body layout, the pseudonym, and the signed messages |
| [`chain/kinds/society.v1.md`](chain/kinds/society.v1.md) | Kinds written at open and on task changes: `document_attached`, `tasks_set`, the task catalogue |
| [`chain/kinds/claims.v1.md`](chain/kinds/claims.v1.md) | Residents' payment claims: `payment_claim`, `claim_closed` |
| [`chain/kinds/notices.v1.md`](chain/kinds/notices.v1.md) | Notices, per-flat votes and citing a vote: `notice`, `vote_opened`, `ballot`, `vote_closed`, `proposal_ref` |
| [`api/v1.md`](api/v1.md) | Reads, writes and the signing edge function |
| [`anchor/v1.md`](anchor/v1.md) | The chain head published monthly outside admin control, and what a client checks against it |
| [`CHANGELOG.md`](CHANGELOG.md) | One line per contract change, append-only |

Rules (full protocol in `CONTRIBUTING.md` §6):

- A contract change is its own PR. It merges before any implementation that
  depends on it.
- Both people approve every change here.
- Additive within a version. Anything inside a hash preimage is never changed
  in place: it gets a new `format_version`, and old entries keep verifying
  under their own version.
- For anything hashed or signed, the test vectors are the real definition. If
  the prose and the vectors disagree, that is a bug in the contract.

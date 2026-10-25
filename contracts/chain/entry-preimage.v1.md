# Chain entry preimage, format_version 1

- **Status:** proposed (#2)
- **Producer:** backend · **Consumer:** frontend (chain verification), anchor (#1)
- **Test vectors:** [`vectors/entry-preimage.v1.json`](vectors/entry-preimage.v1.json)

This spec defines the exact bytes hashed for every entry in a society's chain,
and how each entry links to the one before it. Its target is an independent
implementation, written from this document without reading the backend, that
reproduces every hash in the test vectors byte for byte. **If this prose and
the vectors disagree, that is a bug in the contract. Raise it; do not pick one
of them.**

The key words MUST, MUST NOT and SHOULD are used in their RFC 2119 sense.

---

## 1. Why not hash the JSON

The API's JSON is not the preimage. Serializers reorder keys, vary
whitespace, escape non-ASCII differently and format numbers inconsistently.
Two semantically equal JSON documents can hash differently. The preimage is
therefore a small **binary encoding with a fixed field order**, defined
below. It needs no library: `TextEncoder`, `DataView` and
`crypto.subtle.digest` are enough in a browser.

---

## 2. Primitive encoding

Every value is encoded as a **field**:

```
field = tag (1 byte) || length (4 bytes, unsigned, big-endian) || value (length bytes)
```

The tag and length make every field self-delimiting. No sequence of fields
can be read two ways, so two different entries cannot produce the same
bytes. There is no separator and no padding.

| Tag | Type | `value` bytes | Length |
|---|---|---|---|
| `0x00` | absent | none | always 0 |
| `0x01` | int | signed 64-bit two's complement, big-endian | always 8 |
| `0x02` | text | UTF-8, exactly as stored (§2.2) | byte length, not character count |
| `0x03` | bytes | raw bytes | byte length |
| `0x04` | bool | `0x00` false, `0x01` true | always 1 |
| `0x05` | list | the encoded items concatenated, each a complete field | total byte length of the items |

### 2.1 int

- **Range: −(2^53 − 1) to 2^53 − 1 inclusive.** The server MUST reject a
  value outside it at ingestion. This keeps every int exactly representable
  as a JSON number in a browser (`Number.isSafeInteger`), while the encoding
  itself stays 8 bytes. A verifier MUST treat an out-of-range or non-integer
  value as a failed verification, never round it.
- Negative values are two's complement: −1 is `ffffffffffffffff`.

### 2.2 text

- **UTF-8, NFC, normalized once at ingestion.** The server MUST normalize
  every text field to Unicode NFC **before** hashing, store the NFC form, and
  serve the stored form byte for byte. Devanagari input is expected, and the
  same visible text can arrive in more than one normal form.
- **A verifier MUST NOT normalize, trim or otherwise transform text.** It
  encodes exactly the string the API returned. Normalization happens in one
  place, before hashing. If a verifier also normalized, a server that served
  text different from what it hashed would be silently "corrected" and still
  pass.
- **A string containing a lone surrogate is invalid.** JSON allows
  `"\ud800"`. `TextEncoder` would silently replace it with U+FFFD and hash
  something the server never hashed. A verifier MUST check
  `String.prototype.isWellFormed()` (or equivalent) and treat a failure as a
  failed verification. The server MUST reject such input at ingestion.
- The empty string is valid and encodes as `02 00000000`. It is distinct
  from absent (`00 00000000`).

### 2.3 bytes

Used for hashes. In the API, a bytes value is **lowercase hex** with no
prefix. A verifier MUST reject uppercase or odd-length hex rather than
normalize it.

### 2.4 list

A list's `value` is its items' complete encodings concatenated, in order.
The item count is not stored, because the items delimit themselves. Order is
significant. An empty list is `05 00000000`.

### 2.5 Composite rules

- **Money is always two adjacent fields: `amount_minor` (int) then
  `currency` (text, ISO 4217, three uppercase ASCII letters).** The currency
  is in the preimage on every amount, per AGENTS.md item 4. No field carries
  a decimal point.
- **Timestamps are int milliseconds since the Unix epoch, UTC.** Never an
  ISO 8601 string, because string formats vary in precision and offset
  notation.
- **Calendar dates** (a business date, not an instant) are text in
  `YYYY-MM-DD` form, ASCII only.
- **Enumerations** are text, made of lowercase ASCII letters, digits and
  `_`.
- **Optional fields always occupy their position.** When not present, they
  encode as absent (`0x00`). A field is never omitted from the sequence.

---

## 3. The entry preimage

```
preimage = field(domain)
        || field(format_version)
        || field(society_id)
        || field(sequence)
        || field(prev_hash)
        || field(kind)
        || field(recorded_at)
        || field(actor)
        || field(body)

entry_hash = SHA-256(preimage)
```

| # | Field | Type | Value |
|---|---|---|---|
| 1 | `domain` | text | The constant `clearfunds/chain-entry` |
| 2 | `format_version` | int | `1` for everything in this document |
| 3 | `society_id` | text | The society's stable opaque id, as served by the API and used in the anchor URL (#1) |
| 4 | `sequence` | int | Position in the society's chain: 1, 2, 3, … (§4) |
| 5 | `prev_hash` | bytes | 32 bytes. The `entry_hash` of entry `sequence − 1`, or 32 zero bytes when `sequence` is 1 |
| 6 | `kind` | text | Which record this is. Selects the body layout (§5) |
| 7 | `recorded_at` | int | Server time the entry was appended, in ms UTC. **It is in the hash, so the API MUST return it** |
| 8 | `actor` | text or absent | Who performed the action: an admin's or auditor's id, or a resident's committed pseudonym (AGENTS.md item 11). Absent only for system-generated entries |
| 9 | `body` | list | The kind's fields, in the order its layout defines |

- **Hash algorithm: SHA-256**, identified as `sha256` in the anchor's
  `hash_alg`. `head_hash` in the anchor is the `entry_hash` of entry
  `head_seq`.
- **`domain`** separates these hashes from any other SHA-256 the system
  computes over similar bytes, such as a signature payload or a pseudonym.
- **`society_id` in every preimage** means an entry copied from one society's
  chain into another's does not verify.
- **`sequence` in every preimage** means an entry moved to a different
  position does not verify, independently of `prev_hash`.
- **Nothing the client cannot see is hashed.** Database row ids, insertion
  order, column defaults and receive timestamps other than `recorded_at` are
  all excluded. Every hashed value is returned by the API.

---

## 4. Sequence numbers are contiguous

**Sequence numbers start at 1 and have no gaps, ever.** The server assigns
`sequence = previous + 1` inside the same database transaction that appends
the entry, under a per-society lock. A database sequence/identity object
MUST NOT be used, because those skip values on rollback.

Things that never consume a sequence number: a rejected write, a failed
transaction, an approval that never completed, a validation error. Only an
appended entry has a number. An abandoned in-flight reversal (AGENTS.md
item 5) is an entry only if something about it was chained, such as an
approval cast. If so, it holds its number like any other entry.

Consequence for the verifier: **any gap in the sequence numbers the API
returns is a failed verification**, never a legitimate state.

---

## 5. Body layouts by kind

Each `kind` has a fixed, ordered field list, defined in its own file under
`kinds/` and added by its own contract PR. **A verifier MUST treat an entry
whose `kind` it does not know as unverifiable**, not as passed. It cannot
display what it cannot check.

- Adding a new kind is additive: no existing hash changes, so
  `format_version` stays the same.
- **Changing an existing kind's field list, any type, or anything in §2–§4 is
  a new `format_version`.** Entries keep the version they were written with
  and verify under that version's rules forever. Nothing chained is ever
  re-encoded.

Kinds defined so far:

| `kind` | Layout | Status |
|---|---|---|
| `test_vector` | §5.1 below | Reserved. Exists only so the vectors can exercise every type. **A real chain MUST NOT contain it**, and a verifier MUST fail an entry carrying it |

Ledger entries, approvals, reversals, flags, allocations, limit changes and
year-close records follow as their own contract PRs. The auditor sign-off
(#3) is one of those.

### 5.1 `test_vector`

| # | Field | Type |
|---|---|---|
| 1 | `amount_minor` | int |
| 2 | `currency` | text |
| 3 | `delta` | int (exercises a negative value) |
| 4 | `note` | text (exercises multi-byte UTF-8) |
| 5 | `empty_note` | text (exercises the empty string) |
| 6 | `optional` | absent |
| 7 | `flag` | bool |
| 8 | `ref_hash` | bytes |
| 9 | `ids` | list of int |
| 10 | `none` | list (empty) |

---

## 6. Verifying a chain

Given entries `1..n` from the API:

1. For each entry, in sequence order:
   - check `sequence` equals its position (§4)
   - check `prev_hash` equals the previous entry's computed hash, or 32 zero
     bytes for entry 1
   - check `format_version` and `kind` are known
   - encode the entry per §3 and hash it
2. Compare the computed hash at `head_seq` with the anchor's `head_hash`
   (#1). **Compare against the hash you computed, never against an
   `entry_hash` the API reports.** The API may return `entry_hash` for
   display and debugging. A verifier that trusts it proves nothing.

Any failed check in step 1 is a failed verification. Never skip it or
downgrade it to a warning.

---

## 7. Worked example

Entry 1 of the vectors as the API returns it:

```json
{
  "format_version": 1, "society_id": "soc_7f3k9q", "sequence": 1,
  "prev_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "kind": "test_vector", "recorded_at": 1793520000000, "actor": "adm_4b1c",
  "body": {
    "amount_minor": 125075, "currency": "INR", "delta": -125075,
    "note": "रखरखाव शुल्क — अक्टूबर 2026", "empty_note": "", "optional": null,
    "flag": true,
    "ref_hash": "b081d5a69ee868dd0285cf25f877a1217a5eef422dd6c1ef52f68a72761399ba",
    "ids": [3, 1, 2], "none": []
  }
}
```

The preimage, one field per line as `tag+length value`:

```
domain          0200000016 636c65617266756e64732f636861696e2d656e747279
format_version  0100000008 0000000000000001
society_id      020000000a 736f635f3766336b3971
sequence        0100000008 0000000000000001
prev_hash       0300000020 0000000000000000000000000000000000000000000000000000000000000000
kind            020000000b 746573745f766563746f72
recorded_at     0100000008 000001a1961f5c00                    2026-11-01T08:00:00Z
actor           0200000008 61646d5f34623163
body            05000000ce                                     list, 206 bytes
  amount_minor    0100000008 000000000001e893                  125075 = ₹1,250.75
  currency        0200000003 494e52                            INR
  delta           0100000008 fffffffffffe176d                  -125075
  note            0200000041 e0a4b0e0a496…2032303236           65 bytes of UTF-8 for 27 characters
  empty_note      0200000000                                   empty text
  optional        0000000000                                   absent
  flag            0400000001 01
  ref_hash        0300000020 b081d5a69ee868dd0285cf25f877a1217a5eef422dd6c1ef52f68a72761399ba
  ids             0500000027                                   list, 39 bytes
                    0100000008 0000000000000003
                    0100000008 0000000000000001
                    0100000008 0000000000000002
  none            0500000000                                   empty list
```

```
entry_hash(1) = f9548f3eac3a2a0219414f9dfb94776f6cafe446caa913389fcfe95aacb8bbcb
```

Entry 2 carries that value as its `prev_hash`, with `sequence` 2, and hashes to
`a415634efbabe6a5ff08504e19dca78bd7759ab322670924c84de38c84e771fd`. That is the
`head_hash` of the two-entry chain. The full preimage hex of both entries, the
primitive encodings, and the cases that must differ or be rejected are in the
vectors file.

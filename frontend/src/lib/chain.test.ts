import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { encode, preimage, sha256, hex, walk, TEST_VECTOR, ChainError, type Entry } from './chain'

const vectors = JSON.parse(
  readFileSync(resolve(__dirname, '../../../contracts/chain/vectors/entry-preimage.v1.json'), 'utf8'),
)

describe('contracts/chain/vectors/entry-preimage.v1.json', () => {
  /*
   * The vector file is the ONLY thing proving our preimage agrees with the
   * server's. Every case below is generated from it, which is the right
   * shape - and is also how the whole check can retire itself in silence: a
   * `for...of` over an empty array generates zero `it()` calls and the file
   * reports green with nothing tested.
   *
   * Measured, not theorised. Emptying `primitives` alone deletes all 17
   * encoder vectors - the length-prefixing and type-tagging the entire hash
   * chain rests on - and this suite still passed 9 of 9. Emptying `entries`
   * as well does fail, but only incidentally, because four later cases index
   * `entries[0]` and crash; that is a side effect of how they are written,
   * not a guard, and it would disappear the moment someone made those cases
   * defensive.
   *
   * The file is generated and lives in the contract, so it can lose a section
   * to a regenerate, a rename or a merge without anyone editing this file.
   * So the counts are asserted first, and deliberately against a FLOOR rather
   * than an exact number: an exact count is the assertion-on-a-sample-number
   * trap, 'fixed' by editing the expected figure when a vector is legitimately
   * added.
   */
  it('reads a populated vector file, or stops the suite', () => {
    expect(vectors.primitives?.length, 'no primitive vectors: the encoder check has retired itself')
      .toBeGreaterThan(10)
    expect(vectors.entries?.length, 'no entry vectors: nothing checks the preimage')
      .toBeGreaterThan(1)
    expect(vectors.must_differ?.length, 'no must_differ vectors: nothing checks that a change moves the hash')
      .toBeGreaterThan(1)
    expect(vectors.must_reject?.length, 'no must_reject vectors: nothing checks what has to be refused')
      .toBeGreaterThan(4)
    expect(vectors.chains?.length, 'no chain vectors: nothing checks a head against the contract')
      .toBeGreaterThan(0)
  })

  /*
   * THE `chains` SECTION: A VALID CHAIN'S HEAD, WHICH NOTHING ELSE COVERS.
   *
   * Every other section checks one entry or one rejection. This one states
   * what a DEVICE must arrive at after walking a whole chain - the head hash
   * - and that is a different claim: the per-entry cases can all pass while
   * the walk links them wrongly, because each one hashes its entry in
   * isolation and never asserts that entry 2 chains onto entry 1's computed
   * hash rather than onto the one the file happens to carry.
   *
   * The chain-level rows in `must_reject` are the mirror of this and are
   * asserted separately: they say which chains must be REFUSED. Neither
   * substitutes for the other, so this is driven from the contract rather
   * than hand-written, and the head is compared to the contract's figure.
   *
   * Why it needs a layout: these entries are `kind: test_vector`, which
   * `walk` refuses outright - a reserved kind inside a real chain is one of
   * the rejections above. So the chain is recomputed here with the explicit
   * TEST_VECTOR layout, the same way the per-entry cases do it, and the link
   * check is asserted directly. Handing `walk` a layout override purely to
   * accommodate a test would weaken the reserved-kind rule in production
   * code, which is the wrong trade.
   */
  for (const c of vectors.chains as {
    name: string; sequences: number[]; head_seq: number; head_hash: string
  }[]) {
    it(`arrives at the contract's head for ${c.name}`, async () => {
      const bySeq = new Map<number, Entry>(
        (vectors.entries as { entry: Entry }[]).map((v) => [v.entry.sequence, v.entry]),
      )
      // A sequence the contract names but the file does not carry would make
      // every assertion below vacuous, so it fails here instead.
      const chain = c.sequences.map((n) => {
        const e = bySeq.get(n)
        expect(e, `the chain vector names sequence ${n} but no entry vector has it`).toBeDefined()
        return e!
      })
      expect(chain.length, 'a chain vector of one entry proves no linking').toBeGreaterThan(1)

      let prev = '0'.repeat(64)
      let head = ''
      for (const e of chain) {
        /*
         * The link is asserted on the hash THIS loop computed, never on the
         * entry_hash in the file. Reading prev_hash against the file's own
         * recorded hash is the mistake that makes a chain check tautological:
         * it would pass on a file whose entries do not actually chain.
         */
        expect(e.prev_hash, `sequence ${e.sequence} does not link to the hash computed for the entry before it`)
          .toBe(prev)
        head = hex(await sha256(preimage(e, TEST_VECTOR)))
        prev = head
      }
      expect(chain.at(-1)!.sequence, 'the walk ended on a different sequence than the contract calls the head')
        .toBe(c.head_seq)
      expect(head, "the head this device computed is not the contract's head").toBe(c.head_hash)
    })
  }

  for (const p of vectors.primitives) {
    it(`encodes ${p.name}`, () => {
      expect(hex(encode(p.type === 'list' ? 'list<int>' : p.type, p.value))).toBe(p.encoding_hex)
    })
  }
  for (const v of vectors.entries) {
    it(`hashes ${v.name}`, async () => {
      const pre = preimage(v.entry as Entry, TEST_VECTOR)
      expect(hex(pre)).toBe(v.preimage_hex)
      expect(hex(await sha256(pre))).toBe(v.entry_hash)
    })
  }
  it('a one-paisa change changes the hash', async () => {
    const e = structuredClone(vectors.entries[0].entry)
    e.body.amount_minor = 125076
    expect(hex(await sha256(preimage(e, TEST_VECTOR)))).toBe(vectors.must_differ[0].entry_hash)
  })
  it('never normalises: NFC and NFD hash differently', async () => {
    const e = structuredClone(vectors.entries[0].entry)
    e.body.note = 'Café नमस्ते'.normalize('NFC')
    const nfc = hex(await sha256(preimage(e, TEST_VECTOR)))
    e.body.note = 'Café नमस्ते'.normalize('NFD')
    const nfd = hex(await sha256(preimage(e, TEST_VECTOR)))
    expect(nfc).toBe(vectors.must_differ[1].nfc_entry_hash)
    expect(nfd).toBe(vectors.must_differ[1].nfd_entry_hash)
  })
  /*
   * These were three hand-written rows that happened to match the contract's
   * `must_reject` list today. A duplicated list is the `flat_set` bug class:
   * he adds a sixth case, our copy still has five, and the suite stays green
   * while never testing the new one.
   *
   * The values now come from the file. The TYPE does not, because the
   * contract's rows do not carry one - each has `name`, `json_value` and a
   * `why` naming the spec section, so which encoder type a value belongs to
   * is only recoverable from the prose. That mapping is therefore stated here
   * and is the one piece that stays ours.
   *
   * What makes it safe is the coverage assertion below: the map is keyed by
   * the contract's own `name`, every encoder row must find a key, and every
   * key must match a row. A renamed row, an added rejection or a deleted one
   * all fail here rather than silently dropping out of the loop. The two
   * chain-level rows (a sequence gap, the reserved kind) are excluded on
   * purpose - they need `walk`, and their own cases below assert on the
   * message rather than just the error type.
   */
  const CHAIN_LEVEL = ['entry 2 served with sequence 3', 'entry with kind test_vector inside a real chain']

  /*
   * THE LONE-SURROGATE ROW, AND WHY IT IS THE ONE ROW WE DO NOT TRUST BLINDLY.
   *
   * Type stays ours because the contract's rows do not carry one. The value is
   * taken from the contract - with one guard, because this row was written
   * `"\\\\ud800"` for a while: a DOUBLED backslash, which parses to the
   * six-character string `\\ud800` rather than to U+D800. Measured in Node
   * against the real file at the time: length 6, first code unit 0x5c,
   * `isWellFormed()` true. That string is ordinary text, so the vector whose
   * whole purpose is catching an implementation that ACCEPTS lone surrogates
   * was passed by one that never rejects them. Found by driving these cases
   * from the file rather than hand-writing them (#124).
   *
   * `surrogateFallback` is therefore not an override of the contract - it is
   * what runs ONLY while the row cannot express its own subject. The moment
   * the file carries a real surrogate the contract's value is used, and the
   * case below asserts which of the two happened rather than asserting the
   * defect is still present. The previous version of this file pinned the
   * doubled escape itself, which was right while the fix was outstanding and
   * turns into a test that FAILS ON THE FIX - so it is replaced rather than
   * deleted, because something must still prove the row is load-bearing.
   *
   * What makes either path safe is that this row stays READ: its presence, its
   * name and its count are asserted by the coverage case above, and the
   * encoder must refuse whichever value is used.
   */
  const SURROGATE_ROW = 'text with a lone surrogate'
  const surrogateFallback = '\ud800'
  const hasLoneSurrogate = (v: unknown): boolean =>
    typeof v === 'string' && /[\uD800-\uDFFF]/.test(v) && !v.isWellFormed()
  const ENCODER_TYPE: Readonly<Record<string, { type: string }>> = {
    [SURROGATE_ROW]: { type: 'text' },
    'int above 2^53-1': { type: 'int' },
    'bytes in uppercase hex': { type: 'bytes' },
  }
  const rejections = (vectors.must_reject as { name: string; json_value?: unknown }[])
    .filter((r) => !CHAIN_LEVEL.includes(r.name))

  it('maps every encoder rejection the contract states, and no extras', () => {
    const named = rejections.map((r) => r.name).sort()
    expect(named.length, 'no encoder-level rejections survived the filter').toBeGreaterThan(2)
    // Both directions: a new contract row has no mapping, a stale key has no row.
    expect(named, 'the contract states an encoder rejection this file does not map')
      .toEqual(Object.keys(ENCODER_TYPE).sort())
  })

  it('refuses a lone surrogate on the contract value once it can express one', () => {
    /*
     * Asserts the row is load-bearing, whichever side of the fix the contract
     * is on - and says which. It replaces a case that pinned the DEFECT (the
     * doubled escape still being there), which was correct while the fix was
     * outstanding and would have failed the moment it landed, teaching whoever
     * read it to delete the only thing keeping this row honest.
     *
     * Checked by code unit and by `isWellFormed`, not by `length`, because
     * that is the whole subject: a lone surrogate is one UTF-16 code unit that
     * is not valid text, and `\\ud800` is six that are. `length` cannot tell
     * them apart in general - a 6-character string of valid text and a
     * 6-character string containing an unpaired surrogate are both 6.
     *
     * The real surrogate is refused EITHER WAY, so the suite never stops
     * covering the subject while the contract is wrong. What changes when the
     * fix lands is only whether the proof comes from the contract or from us,
     * which is what the two branches record.
     */
    const row = rejections.find((r) => r.name === SURROGATE_ROW)
    expect(row, 'the lone-surrogate rejection left the contract').toBeDefined()
    const v = row!.json_value
    expect(typeof v, 'json_value is no longer a string').toBe('string')

    // The subject itself, independent of what the file says: this must always hold.
    expect(
      hasLoneSurrogate(surrogateFallback),
      'the fallback is not a lone surrogate, so this suite proves nothing about one',
    ).toBe(true)
    expect(() => encode('text', surrogateFallback)).toThrow(ChainError)

    /*
     * `hasLoneSurrogate` decides which branch runs, so it has to distinguish a
     * LONE surrogate from a valid astral pair - and a code-unit range test
     * alone cannot: '\u{1F600}' is two code units both inside U+D800..U+DFFF,
     * and is perfectly well-formed text the encoder must ACCEPT. Without the
     * `isWellFormed` term this predicate calls an emoji a lone surrogate, and
     * every row of the contract that happens to contain one would be quietly
     * swapped for the fallback - the substitution firing where no defect
     * exists, which is how it would outlive its cause after all.
     *
     * Asserted here because no vector row carries an emoji today, so nothing
     * else in this file fails when that term is dropped. Measured: removing it
     * leaves all 30 cases green.
     */
    expect(hasLoneSurrogate('\u{1F600}'), 'a valid astral pair is not a lone surrogate').toBe(false)
    expect(() => encode('text', '\u{1F600}')).not.toThrow()
    expect(hasLoneSurrogate('a\ud800b'), 'an embedded unpaired surrogate is one').toBe(true)
    expect(hasLoneSurrogate('\u{1F600}\ud800'), 'an unpaired surrogate after a valid pair is one').toBe(true)
    expect(hasLoneSurrogate('plain'), 'ordinary text is not one').toBe(false)

    if (hasLoneSurrogate(v)) {
      // The fix landed: the contract now states its own subject, so use it.
      expect(() => encode('text', v)).toThrow(ChainError)
    } else {
      /*
       * Still the doubled escape. The row parses to ordinary text, which the
       * encoder correctly ACCEPTS - so assert exactly that, to record that the
       * contract value cannot fail anything today and the fallback is why this
       * row is still covered.
       */
      expect(v as string).toBe('\\ud800')
      expect(() => encode('text', v)).not.toThrow()
    }
  })

  for (const r of rejections) {
    it(`rejects ${r.name}`, () => {
      const m = ENCODER_TYPE[r.name]
      if (!m) {
        /*
         * Not `expect(m).toBeDefined()`: that does not narrow for the
         * compiler, and a non-null assertion would silence exactly the case
         * the coverage test above exists to catch. A throw fails the case and
         * names the row.
         */
        throw new Error(`no encoder type mapped for "${r.name}"`)
      }
      /*
       * The contract's value, except for the one row that cannot yet express
       * its own subject (see `surrogateFallback` above). The substitution is
       * conditional on the VALUE, not on the row's name alone, so it stops
       * happening by itself the moment the contract is fixed - nobody has to
       * remember to remove it.
       */
      const value = r.name === SURROGATE_ROW && !hasLoneSurrogate(r.json_value)
        ? surrogateFallback
        : r.json_value
      expect(() => encode(m.type, value)).toThrow(ChainError)
    })
  }
  it('rejects a gap in the sequence', async () => {
    // Entry 2 served where entry 1 should be: the first check that runs.
    await expect(walk([{ ...vectors.entries[1].entry, sequence: 2 }])).rejects.toThrow(/gap/)
  })
  it('rejects the reserved kind inside a real chain', async () => {
    await expect(walk([vectors.entries[0].entry])).rejects.toThrow(/reserved/)
  })
})

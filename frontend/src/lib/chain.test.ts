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
  })

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
   * Type, and in one case the value, stay ours. The type because the contract's
   * rows do not carry one. The value because of a defect in the vector file,
   * found by driving these from it:
   *
   * The lone-surrogate row is written `"\\\\ud800"` - a DOUBLED backslash -
   * so it parses to the six-character string `\\ud800` rather than to U+D800.
   * Measured in Node against the real file: length 6, first code unit 0x5c.
   * That string is perfectly well-formed text, so an implementation that never
   * rejects lone surrogates passes the vector that exists to catch it.
   *
   * It is a one-character fix on his side: a SINGLE `\\ud800` in the JSON
   * parses to a real one-code-unit surrogate, in both Node and Python. So this
   * is an escaping slip in a generated file, not a limit of the format.
   *
   * Until it lands, `override` supplies the real U+D800 while the row is still
   * READ - its presence, its name and its count all stay asserted below - and
   * the case after this one fails the moment the fix arrives, so the override
   * cannot outlive its cause.
   */
  const ENCODER_TYPE: Readonly<Record<string, { type: string; override?: unknown }>> = {
    'text with a lone surrogate': { type: 'text', override: '\ud800' },
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

  it('the lone-surrogate vector still carries the doubled escape', () => {
    /*
     * Pins the reason the override exists so it cannot outlive its cause. The
     * assertion is on the VALUE, not on a version or a date: the day his row
     * holds a real surrogate this fails, and whoever reads the message deletes
     * the override rather than carrying it forever.
     *
     * Checked by code unit rather than by `length`, because that is the whole
     * subject - a lone surrogate is one UTF-16 code unit that is not valid
     * text, and `\\ud800` is six that are.
     */
    const row = rejections.find((r) => r.name === 'text with a lone surrogate')
    expect(row, 'the lone-surrogate rejection left the contract').toBeDefined()
    const v = row!.json_value
    expect(typeof v, 'json_value is no longer a string').toBe('string')
    expect(
      /[\uD800-\uDFFF]/.test(v as string),
      'the contract now carries a real lone surrogate: delete the override and use json_value',
    ).toBe(false)
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
      expect(() => encode(m.type, 'override' in m ? m.override : r.json_value)).toThrow(ChainError)
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

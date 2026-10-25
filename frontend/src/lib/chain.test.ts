import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { encode, preimage, sha256, hex, walk, TEST_VECTOR, ChainError, type Entry } from './chain'

const vectors = JSON.parse(
  readFileSync(resolve(__dirname, '../../../contracts/chain/vectors/entry-preimage.v1.json'), 'utf8'),
)

describe('contracts/chain/vectors/entry-preimage.v1.json', () => {
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
  it.each([
    ['a lone surrogate', 'text', '\ud800'],
    ['an int above 2^53-1', 'int', 9007199254740992],
    ['uppercase hex', 'bytes', 'ABAB'],
  ])('rejects %s', (_n, t, v) => {
    expect(() => encode(t, v)).toThrow(ChainError)
  })
  it('rejects a gap in the sequence', async () => {
    // Entry 2 served where entry 1 should be: the first check that runs.
    await expect(walk([{ ...vectors.entries[1].entry, sequence: 2 }])).rejects.toThrow(/gap/)
  })
  it('rejects the reserved kind inside a real chain', async () => {
    await expect(walk([vectors.entries[0].entry])).rejects.toThrow(/reserved/)
  })
})

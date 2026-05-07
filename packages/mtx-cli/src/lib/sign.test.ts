import { describe, expect, it } from 'vitest'
import { deterministicHashHex, generateKeyPair, signEntries, type PackEntry } from './sign'

describe('deterministicHashHex', () => {
  it('produces stable hash regardless of entry order', () => {
    const a: PackEntry[] = [
      { path: 'a.txt', content: new Uint8Array([1, 2, 3]) },
      { path: 'b.txt', content: new Uint8Array([4, 5, 6]) },
    ]
    const b: PackEntry[] = [...a].reverse()
    expect(deterministicHashHex(a)).toBe(deterministicHashHex(b))
  })

  it('excludes signature.sig from hash', () => {
    const without: PackEntry[] = [{ path: 'a.txt', content: new Uint8Array([1]) }]
    const withSig: PackEntry[] = [
      ...without,
      { path: 'signature.sig', content: new Uint8Array([99]) },
    ]
    expect(deterministicHashHex(without)).toBe(deterministicHashHex(withSig))
  })
})

describe('signEntries / generateKeyPair', () => {
  it('produces a 64-byte ed25519 signature', async () => {
    const { priv } = await generateKeyPair()
    const entries: PackEntry[] = [{ path: 'a.txt', content: new Uint8Array([1, 2]) }]
    const sigB64 = await signEntries(entries, priv)
    const sig = Buffer.from(sigB64, 'base64')
    expect(sig.length).toBe(64)
  })
})

import * as ed from '@noble/ed25519'
import { sha256, sha512 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m))

export interface PackEntry {
  path: string
  content: Uint8Array
}

export function deterministicHashHex(entries: PackEntry[]): string {
  const sorted = entries
    .filter((e) => e.path !== 'signature.sig')
    .map((e) => ({ path: e.path, hash: bytesToHex(sha256(e.content)) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  const lines = sorted.map((e) => `${e.path} ${e.hash}\n`).join('')
  return bytesToHex(sha256(new TextEncoder().encode(lines)))
}

export async function signEntries(entries: PackEntry[], privKey: Uint8Array): Promise<string> {
  const hashHex = deterministicHashHex(entries)
  const message = new TextEncoder().encode(hashHex)
  const sig = await ed.signAsync(message, privKey)
  return Buffer.from(sig).toString('base64')
}

export async function generateKeyPair(): Promise<{ priv: Uint8Array; pubB64: string }> {
  const priv = ed.utils.randomPrivateKey()
  const pub = await ed.getPublicKeyAsync(priv)
  return { priv, pubB64: Buffer.from(pub).toString('base64') }
}

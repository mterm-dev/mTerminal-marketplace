import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2'

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m))

export async function verifyEd25519(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  try {
    return ed.verify(signature, message, publicKey)
  } catch {
    return false
  }
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s)
}

export function isValidPubkeyB64(b64: string): boolean {
  try {
    return b64ToBytes(b64).length === 32
  } catch {
    return false
  }
}

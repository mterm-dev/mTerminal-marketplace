import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'
import { b64ToBytes, verifyEd25519 } from '../lib/ed25519'
import type { PolicyError } from '@mterminal/marketplace-types'

export interface UnzippedEntry {
  path: string
  content: Uint8Array
}

const SIGNATURE_PATH = 'signature.sig'

export function deterministicHashHex(entries: UnzippedEntry[]): string {
  const sorted = entries
    .filter((e) => e.path !== SIGNATURE_PATH)
    .map((e) => ({ path: e.path, hash: bytesToHex(sha256(e.content)) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  const lines = sorted.map((e) => `${e.path} ${e.hash}\n`).join('')
  return bytesToHex(sha256(new TextEncoder().encode(lines)))
}

export interface SignatureCheckOk {
  ok: true
  sha256Hex: string
  signatureB64: string
}

export interface SignatureCheckErr {
  ok: false
  error: PolicyError
}

export type SignatureCheckResult = SignatureCheckOk | SignatureCheckErr

export async function checkSignature(
  entries: UnzippedEntry[],
  pubkeyB64: string,
): Promise<SignatureCheckResult> {
  const sigEntry = entries.find((e) => e.path === SIGNATURE_PATH)
  if (!sigEntry) {
    return {
      ok: false,
      error: { code: 'signature', issues: [{ message: 'missing signature.sig in package' }] },
    }
  }
  const sigB64 = new TextDecoder().decode(sigEntry.content).trim()
  let sig: Uint8Array
  try {
    sig = b64ToBytes(sigB64)
  } catch {
    return {
      ok: false,
      error: { code: 'signature', issues: [{ message: 'signature.sig is not valid base64' }] },
    }
  }
  if (sig.length !== 64) {
    return {
      ok: false,
      error: {
        code: 'signature',
        issues: [{ message: `signature must be 64 bytes (got ${sig.length})` }],
      },
    }
  }

  const pubkey = b64ToBytes(pubkeyB64)
  if (pubkey.length !== 32) {
    return {
      ok: false,
      error: { code: 'signature', issues: [{ message: 'public key must be 32 bytes' }] },
    }
  }

  const hashHex = deterministicHashHex(entries)
  const message = new TextEncoder().encode(hashHex)
  const ok = await verifyEd25519(sig, message, pubkey)
  if (!ok) {
    return {
      ok: false,
      error: { code: 'signature', issues: [{ message: 'signature verification failed' }] },
    }
  }
  return { ok: true, sha256Hex: hashHex, signatureB64: sigB64 }
}

import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

export function hashApiKey(plain: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(plain)))
}

export function generateApiKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return 'mtx_' + btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function bearerFromHeader(header: string | null): string | null {
  if (!header) return null
  const m = /^Bearer\s+(.+)$/.exec(header.trim())
  return m ? m[1]! : null
}

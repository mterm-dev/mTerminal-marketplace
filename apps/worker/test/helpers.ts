import { env } from 'cloudflare:test'
import { zipSync, strToU8 } from 'fflate'
import * as ed from '@noble/ed25519'
import { sha256, sha512 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m))

export type WorkerEnv = typeof env

export async function clearDb(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ratings'),
    env.DB.prepare('DELETE FROM downloads'),
    env.DB.prepare('DELETE FROM versions'),
    env.DB.prepare('DELETE FROM extensions'),
    env.DB.prepare('DELETE FROM public_keys'),
    env.DB.prepare('DELETE FROM authors'),
  ])
}

export function bytesToB64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!)
  return btoa(s)
}

export interface AuthorFixture {
  authorId: string
  apiKey: string
  apiKeyHash: string
  login: string
  privKey: Uint8Array
  pubKey: Uint8Array
  pubB64: string
  keyId: string
}

export async function seedAuthor(login = 'demo-user'): Promise<AuthorFixture> {
  const idNum = Math.abs([...login].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7))
  const authorId = `gh-${idNum}`
  const apiKey = 'mtx_' + bytesToB64(crypto.getRandomValues(new Uint8Array(24)))
  const apiKeyHash = bytesToHex(sha256(new TextEncoder().encode(apiKey)))
  const priv = ed.utils.randomPrivateKey()
  const pub = await ed.getPublicKeyAsync(priv)
  const pubB64 = bytesToB64(pub)
  const keyId = `${authorId}:key1`

  await env.DB.prepare(
    `INSERT INTO authors (id, github_login, api_key_hash, banned, created_at) VALUES (?, ?, ?, 0, ?)`,
  )
    .bind(authorId, login, apiKeyHash, Date.now())
    .run()
  await env.DB.prepare(
    `INSERT INTO public_keys (id, author_id, pubkey_b64, name, revoked_at, created_at) VALUES (?, ?, ?, NULL, NULL, ?)`,
  )
    .bind(keyId, authorId, pubB64, Date.now())
    .run()

  return { authorId, apiKey, apiKeyHash, login, privKey: priv, pubKey: pub, pubB64, keyId }
}

export async function seedSession(userLogin: string): Promise<{ token: string; userId: string }> {
  const idNum = Math.abs(
    [...userLogin].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7),
  )
  const userId = `gh-${idNum}`
  const token = 'sess_' + bytesToB64(crypto.getRandomValues(new Uint8Array(16)))
  await env.SESSIONS.put(
    `session:${token}`,
    JSON.stringify({ userId, userLogin }),
    { expirationTtl: 600 },
  )
  return { token, userId }
}

export interface PackageOpts {
  id: string
  version: string
  authorId: string
  keyId: string
  privKey: Uint8Array
  extraEntries?: Record<string, string | Uint8Array>
  flipSig?: boolean
  capabilities?: string[]
  allowedNetworkDomains?: string[]
}

export async function buildPackage(o: PackageOpts): Promise<Uint8Array> {
  const pkg = {
    name: `mterminal-plugin-${o.id}`,
    version: o.version,
    main: 'dist/main.cjs',
    description: 'demo extension',
    engines: { 'mterminal-api': '^1.0.0' },
    mterminal: {
      id: o.id,
      displayName: o.id,
      category: 'other',
      publisher: { authorId: o.authorId, keyId: o.keyId },
      activationEvents: ['onStartupFinished'],
      capabilities: o.capabilities ?? ['clipboard'],
      allowedNetworkDomains: o.allowedNetworkDomains ?? [],
      contributes: {},
    },
  }
  const entries: Record<string, Uint8Array> = {
    'package.json': strToU8(JSON.stringify(pkg, null, 2)),
    'dist/main.cjs': strToU8('module.exports = { activate(){}, deactivate(){} }\n'),
    'README.md': strToU8(`# ${o.id}\n`),
  }
  if (o.extraEntries) {
    for (const [k, v] of Object.entries(o.extraEntries)) {
      entries[k] = typeof v === 'string' ? strToU8(v) : v
    }
  }

  const sortedKeys = Object.keys(entries).sort()
  const lines = sortedKeys
    .map((p) => `${p} ${bytesToHex(sha256(entries[p]!))}\n`)
    .join('')
  const sortedHash = bytesToHex(sha256(new TextEncoder().encode(lines)))
  const messageBytes = new TextEncoder().encode(sortedHash)
  const sig = await ed.signAsync(messageBytes, o.privKey)
  let sigB64 = bytesToB64(sig)
  if (o.flipSig) {
    const bytes = new Uint8Array(sig)
    bytes[0] = bytes[0]! ^ 0xff
    sigB64 = bytesToB64(bytes)
  }
  entries['signature.sig'] = strToU8(sigB64)

  return zipSync(entries)
}

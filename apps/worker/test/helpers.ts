import { env } from 'cloudflare:test'
import { zipSync, strToU8 } from 'fflate'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m))

export type WorkerEnv = typeof env

const SCHEMA = `
CREATE TABLE IF NOT EXISTS authors (
  id TEXT PRIMARY KEY,
  github_login TEXT NOT NULL UNIQUE,
  github_user_id INTEGER,
  api_key_hash TEXT NOT NULL,
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS public_keys (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  pubkey_b64 TEXT NOT NULL,
  name TEXT,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS extensions (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'other',
  icon_url TEXT,
  homepage_url TEXT,
  repo_url TEXT,
  latest_version TEXT NOT NULL DEFAULT '',
  curated INTEGER NOT NULL DEFAULT 0,
  recommended INTEGER NOT NULL DEFAULT 0,
  download_total INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
  ext_id TEXT NOT NULL,
  version TEXT NOT NULL,
  api_range TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  signature_b64 TEXT NOT NULL,
  key_id TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '[]',
  readme_md TEXT,
  yanked INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL,
  PRIMARY KEY (ext_id, version)
);
CREATE TABLE IF NOT EXISTS ratings (
  ext_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_login TEXT NOT NULL,
  stars INTEGER NOT NULL,
  comment TEXT,
  helpful INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (ext_id, user_id)
);
CREATE TABLE IF NOT EXISTS downloads (
  ext_id TEXT NOT NULL,
  version TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ext_id, version, day)
);
CREATE VIEW IF NOT EXISTS v_extension_stats AS
  SELECT
    e.id AS ext_id,
    COALESCE(AVG(r.stars), 0) AS avg_stars,
    COALESCE(COUNT(r.stars), 0) AS rating_count
  FROM extensions e
  LEFT JOIN ratings r ON r.ext_id = e.id
  GROUP BY e.id;
`

export async function applySchema(): Promise<void> {
  const stmts = SCHEMA.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)
  for (const s of stmts) {
    await env.DB.exec(s.replace(/\n/g, ' '))
  }
}

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
  const lines = sortedKeys.map((p) => `${p} ${bytesToHex(sha256(entries[p]!))}\n`).join('')
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

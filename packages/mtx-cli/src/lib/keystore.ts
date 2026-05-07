import fs from 'node:fs/promises'
import path from 'node:path'
import { configDir } from './config'

export function keysDir(): string {
  return path.join(configDir(), 'keys')
}

export interface KeyPaths {
  privPath: string
  pubPath: string
}

export function keyPaths(keyId: string): KeyPaths {
  const safe = keyId.replace(/[^a-zA-Z0-9_:.-]/g, '_')
  return {
    privPath: path.join(keysDir(), `${safe}.priv`),
    pubPath: path.join(keysDir(), `${safe}.pub`),
  }
}

export async function writeKey(
  keyId: string,
  priv: Uint8Array,
  pubB64: string,
): Promise<KeyPaths> {
  const dir = keysDir()
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  const paths = keyPaths(keyId)
  await fs.writeFile(paths.privPath, Buffer.from(priv).toString('base64'), {
    mode: 0o600,
  })
  await fs.writeFile(paths.pubPath, pubB64, { mode: 0o600 })
  return paths
}

export async function readPrivKey(keyId: string): Promise<Uint8Array> {
  const { privPath } = keyPaths(keyId)
  const raw = await fs.readFile(privPath, 'utf8')
  return new Uint8Array(Buffer.from(raw.trim(), 'base64'))
}

export async function readPubKeyB64(keyId: string): Promise<string> {
  const { pubPath } = keyPaths(keyId)
  return (await fs.readFile(pubPath, 'utf8')).trim()
}

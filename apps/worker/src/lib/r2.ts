import type { Env } from '../env'

export function packageKey(extId: string, version: string): string {
  return `extensions/${extId}/${version}.mtx`
}

export function iconKey(extId: string): string {
  return `extensions/${extId}/icon.png`
}

export function pubkeyKey(keyId: string): string {
  return `keys/${keyId}.pub`
}

export async function putPackage(
  env: Env,
  extId: string,
  version: string,
  body: Uint8Array,
): Promise<void> {
  await env.PACKAGES.put(packageKey(extId, version), body, {
    httpMetadata: {
      contentType: 'application/zip',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })
}

export async function putPubkey(
  env: Env,
  keyId: string,
  pubkey: Uint8Array,
): Promise<void> {
  await env.PACKAGES.put(pubkeyKey(keyId), pubkey, {
    httpMetadata: { contentType: 'application/octet-stream' },
  })
}

export function packageDownloadUrl(env: Env, extId: string, version: string): string {
  const base = env.PUBLIC_R2_BASE.replace(/\/+$/, '')
  return `${base}/${packageKey(extId, version)}`
}

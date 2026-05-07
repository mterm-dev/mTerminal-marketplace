import { Hono } from 'hono'
import { unzipSync } from 'fflate'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'
import type { Env } from '../env'
import { bearerFromHeader, hashApiKey } from '../lib/jwt'
import {
  getAuthorByApiKeyHash,
  getExtension,
  getPublicKey,
  getVersion,
  insertVersion,
  upsertExtension,
} from '../db/queries'
import { putPackage } from '../lib/r2'
import { isLater } from '../lib/semver'
import { checkManifest } from '../policy/manifest-check'
import {
  checkSignature,
  type UnzippedEntry,
} from '../policy/signature-check'
import { staticScan } from '../policy/static-scan'
import { checkCapabilities } from '../policy/capabilities'
import type { PolicyError, PublishResult } from '@mterminal/marketplace-types'

const MAX_COMPRESSED = 5 * 1024 * 1024
const MAX_UNZIPPED = 25 * 1024 * 1024
const MAX_ENTRIES = 200

export const publishRoutes = new Hono<{ Bindings: Env }>()

function policyResponse(errors: PolicyError[], status = 400) {
  const body: PublishResult = { ok: false, errors }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

publishRoutes.post('/', async (c) => {
  const apiKey = bearerFromHeader(c.req.header('Authorization') ?? null)
  if (!apiKey) return policyResponse([{ code: 'unauthorized', issues: [{ message: 'missing bearer' }] }], 401)
  const author = await getAuthorByApiKeyHash(c.env, hashApiKey(apiKey))
  if (!author) return policyResponse([{ code: 'unauthorized', issues: [{ message: 'invalid api key' }] }], 401)
  if (author.banned)
    return policyResponse([{ code: 'banned', issues: [{ message: 'author is banned' }] }], 403)

  const ct = c.req.header('content-type') ?? ''
  let buf: Uint8Array
  if (ct.startsWith('multipart/form-data')) {
    const form = await c.req.formData()
    const f = form.get('package') as unknown as { arrayBuffer?: () => Promise<ArrayBuffer> } | null
    if (!f || typeof f.arrayBuffer !== 'function')
      return policyResponse([
        { code: 'manifest', issues: [{ message: 'multipart "package" file required' }] },
      ])
    buf = new Uint8Array(await f.arrayBuffer())
  } else {
    buf = new Uint8Array(await c.req.arrayBuffer())
  }

  if (buf.length > MAX_COMPRESSED) {
    return policyResponse([
      {
        code: 'size-limit',
        issues: [{ message: `package exceeds ${MAX_COMPRESSED} bytes (got ${buf.length})` }],
      },
    ])
  }

  let raw: Record<string, Uint8Array>
  try {
    raw = unzipSync(buf)
  } catch (err) {
    return policyResponse([
      {
        code: 'manifest',
        issues: [{ message: `unzip failed: ${(err as Error).message}` }],
      },
    ])
  }

  const entries: UnzippedEntry[] = []
  let totalUnzipped = 0
  for (const [path, content] of Object.entries(raw)) {
    if (path.endsWith('/')) continue
    if (path.startsWith('/') || path.includes('..') || path.includes('\\')) {
      return policyResponse([
        {
          code: 'manifest',
          issues: [{ message: `unsafe path in archive: ${path}` }],
        },
      ])
    }
    totalUnzipped += content.length
    entries.push({ path, content })
  }
  if (entries.length > MAX_ENTRIES) {
    return policyResponse([
      {
        code: 'size-limit',
        issues: [{ message: `archive has ${entries.length} entries (max ${MAX_ENTRIES})` }],
      },
    ])
  }
  if (totalUnzipped > MAX_UNZIPPED) {
    return policyResponse([
      {
        code: 'size-limit',
        issues: [{ message: `unzipped size ${totalUnzipped} exceeds ${MAX_UNZIPPED}` }],
      },
    ])
  }

  const pkgEntry = entries.find((e) => e.path === 'package.json')
  if (!pkgEntry) {
    return policyResponse([
      { code: 'manifest', issues: [{ message: 'package.json not found in archive' }] },
    ])
  }
  let pkg: unknown
  try {
    pkg = JSON.parse(new TextDecoder().decode(pkgEntry.content))
  } catch (err) {
    return policyResponse([
      {
        code: 'manifest',
        issues: [{ message: `package.json is not valid JSON: ${(err as Error).message}` }],
      },
    ])
  }

  const manifestRes = checkManifest(pkg)
  if (!manifestRes.ok) return policyResponse([manifestRes.error])
  const manifest = manifestRes.manifest

  if (manifest.publisher.authorId !== author.id) {
    return policyResponse(
      [
        {
          code: 'publisher-mismatch',
          issues: [
            {
              message: `publisher.authorId "${manifest.publisher.authorId}" does not match authenticated author "${author.id}"`,
            },
          ],
        },
      ],
      403,
    )
  }

  const key = await getPublicKey(c.env, manifest.publisher.keyId)
  if (!key) {
    return policyResponse([
      {
        code: 'unknown-key',
        issues: [{ message: `keyId "${manifest.publisher.keyId}" is not registered` }],
      },
    ])
  }
  if (key.author_id !== author.id) {
    return policyResponse(
      [
        {
          code: 'publisher-mismatch',
          issues: [{ message: 'keyId does not belong to authenticated author' }],
        },
      ],
      403,
    )
  }
  if (key.revoked_at) {
    return policyResponse([
      {
        code: 'unknown-key',
        issues: [{ message: `keyId "${manifest.publisher.keyId}" is revoked` }],
      },
    ])
  }

  const sigRes = await checkSignature(entries, key.pubkey_b64)
  if (!sigRes.ok) return policyResponse([sigRes.error])

  const scanRes = staticScan(entries)
  if (!scanRes.ok) return policyResponse([scanRes.error])

  const capRes = checkCapabilities(manifest.capabilities, manifest.allowedNetworkDomains)
  if (!capRes.ok) return policyResponse([capRes.error])

  const dup = await getVersion(c.env, manifest.id, manifest.version)
  if (dup) {
    return policyResponse(
      [
        {
          code: 'duplicate-version',
          issues: [
            { message: `version "${manifest.version}" already exists for "${manifest.id}"` },
          ],
        },
      ],
      409,
    )
  }

  const existing = await getExtension(c.env, manifest.id)
  if (existing && existing.author_id !== author.id) {
    return policyResponse(
      [
        {
          code: 'publisher-mismatch',
          issues: [{ message: `extension "${manifest.id}" is owned by another author` }],
        },
      ],
      403,
    )
  }

  const sha = bytesToHex(sha256(buf))
  await putPackage(c.env, manifest.id, manifest.version, buf)

  const readmeEntry = entries.find((e) => /^readme\.md$/i.test(e.path))
  const readmeMd = readmeEntry ? new TextDecoder().decode(readmeEntry.content) : null

  const now = Date.now()
  const newLatest =
    !existing || isLater(manifest.version, existing.latest_version)
      ? manifest.version
      : existing.latest_version

  await upsertExtension(c.env, {
    id: manifest.id,
    author_id: author.id,
    display_name: manifest.displayName ?? manifest.id,
    description: manifest.description ?? '',
    category: manifest.category ?? 'other',
    icon_url: existing?.icon_url ?? null,
    homepage_url: manifest.homepageUrl ?? null,
    repo_url: manifest.repoUrl ?? null,
    latest_version: newLatest,
    curated: existing?.curated ?? 0,
    recommended: existing?.recommended ?? 0,
    download_total: existing?.download_total ?? 0,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  })

  await insertVersion(c.env, {
    ext_id: manifest.id,
    version: manifest.version,
    api_range: manifest.apiVersionRange,
    size_bytes: buf.length,
    sha256: sha,
    signature_b64: sigRes.signatureB64,
    key_id: manifest.publisher.keyId,
    manifest_json: JSON.stringify(manifest),
    capabilities: JSON.stringify(manifest.capabilities),
    readme_md: readmeMd,
    yanked: 0,
    published_at: now,
  })

  const ok: PublishResult = {
    ok: true,
    id: manifest.id,
    version: manifest.version,
  }
  return c.json(ok)
})

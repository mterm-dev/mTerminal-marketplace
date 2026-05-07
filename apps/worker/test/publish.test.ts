import { describe, expect, it } from 'vitest'
import { SELF } from 'cloudflare:test'
import { buildPackage, seedAuthor } from './helpers'

async function postPackage(buf: Uint8Array, apiKey: string): Promise<Response> {
  const fd = new FormData()
  fd.append('package', new Blob([buf], { type: 'application/zip' }), 'demo.mtx')
  return SELF.fetch('http://test.local/v1/publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  })
}

describe('publish pipeline', () => {
  it('rejects unauthenticated', async () => {
    const res = await SELF.fetch('http://test.local/v1/publish', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('happy path publishes', async () => {
    const a = await seedAuthor('alice')
    const buf = await buildPackage({
      id: 'demo',
      version: '1.0.0',
      authorId: a.authorId,
      keyId: a.keyId,
      privKey: a.privKey,
    })
    const res = await postPackage(buf, a.apiKey)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean; id: string; version: string }
    expect(json.ok).toBe(true)
    expect(json.id).toBe('demo')
    expect(json.version).toBe('1.0.0')

    const detail = await SELF.fetch('http://test.local/v1/extensions/demo')
    expect(detail.status).toBe(200)
    const j = (await detail.json()) as { latestVersion: string; versions: { version: string }[] }
    expect(j.latestVersion).toBe('1.0.0')
    expect(j.versions[0]?.version).toBe('1.0.0')
  })

  it('rejects flipped signature', async () => {
    const a = await seedAuthor('bob')
    const buf = await buildPackage({
      id: 'demo',
      version: '1.0.0',
      authorId: a.authorId,
      keyId: a.keyId,
      privKey: a.privKey,
      flipSig: true,
    })
    const res = await postPackage(buf, a.apiKey)
    expect(res.status).toBe(400)
    const j = (await res.json()) as { errors: { code: string }[] }
    expect(j.errors[0]?.code).toBe('signature')
  })

  it('rejects invalid manifest', async () => {
    const a = await seedAuthor('carol')
    const buf = await buildPackage({
      id: 'BadId',
      version: '1.0.0',
      authorId: a.authorId,
      keyId: a.keyId,
      privKey: a.privKey,
    })
    const res = await postPackage(buf, a.apiKey)
    expect(res.status).toBe(400)
    const j = (await res.json()) as { errors: { code: string }[] }
    expect(j.errors[0]?.code).toBe('manifest')
  })

  it('rejects eval() in source', async () => {
    const a = await seedAuthor('dave')
    const buf = await buildPackage({
      id: 'demo',
      version: '1.0.0',
      authorId: a.authorId,
      keyId: a.keyId,
      privKey: a.privKey,
      extraEntries: { 'dist/renderer.mjs': 'export const x = eval("1+1")' },
    })
    const res = await postPackage(buf, a.apiKey)
    expect(res.status).toBe(400)
    const j = (await res.json()) as { errors: { code: string }[] }
    expect(j.errors[0]?.code).toBe('static-scan')
  })

  it('rejects duplicate version', async () => {
    const a = await seedAuthor('eve')
    const buf = await buildPackage({
      id: 'demo',
      version: '1.0.0',
      authorId: a.authorId,
      keyId: a.keyId,
      privKey: a.privKey,
    })
    const r1 = await postPackage(buf, a.apiKey)
    expect(r1.status).toBe(200)
    const r2 = await postPackage(buf, a.apiKey)
    expect(r2.status).toBe(409)
    const j = (await r2.json()) as { errors: { code: string }[] }
    expect(j.errors[0]?.code).toBe('duplicate-version')
  })

  it('rejects publisher mismatch', async () => {
    const a = await seedAuthor('frank')
    const b = await seedAuthor('mallory')
    const buf = await buildPackage({
      id: 'demo',
      version: '1.0.0',
      authorId: b.authorId,
      keyId: b.keyId,
      privKey: b.privKey,
    })
    const res = await postPackage(buf, a.apiKey)
    expect(res.status).toBe(403)
  })
})

describe('extension search and download', () => {
  it('search returns published extensions', async () => {
    const a = await seedAuthor('grace')
    const buf = await buildPackage({
      id: 'searchable',
      version: '1.0.0',
      authorId: a.authorId,
      keyId: a.keyId,
      privKey: a.privKey,
    })
    await postPackage(buf, a.apiKey)
    const r = await SELF.fetch('http://test.local/v1/extensions?q=searchable')
    expect(r.status).toBe(200)
    const j = (await r.json()) as { items: { id: string }[]; total: number }
    expect(j.total).toBe(1)
    expect(j.items[0]?.id).toBe('searchable')
  })

  it('download endpoint returns json info and bumps counter', async () => {
    const a = await seedAuthor('heidi')
    const buf = await buildPackage({
      id: 'dl',
      version: '1.0.0',
      authorId: a.authorId,
      keyId: a.keyId,
      privKey: a.privKey,
    })
    await postPackage(buf, a.apiKey)
    const r = await SELF.fetch(
      'http://test.local/v1/extensions/dl/versions/1.0.0/download',
      { headers: { Accept: 'application/json' } },
    )
    expect(r.status).toBe(200)
    const j = (await r.json()) as { sha256: string; sizeBytes: number; signatureB64: string }
    expect(j.sha256.length).toBe(64)
    expect(j.sizeBytes).toBe(buf.length)

    const detail = await SELF.fetch('http://test.local/v1/extensions/dl')
    const dj = (await detail.json()) as { downloadTotal: number }
    expect(dj.downloadTotal).toBeGreaterThanOrEqual(1)
  })

  it('batch ?ids= returns multiple extensions', async () => {
    const a = await seedAuthor('ivan')
    for (const id of ['one', 'two']) {
      const buf = await buildPackage({
        id,
        version: '1.0.0',
        authorId: a.authorId,
        keyId: a.keyId,
        privKey: a.privKey,
      })
      const r = await postPackage(buf, a.apiKey)
      expect(r.status).toBe(200)
    }
    const r = await SELF.fetch('http://test.local/v1/extensions?ids=one,two')
    const j = (await r.json()) as { total: number }
    expect(j.total).toBe(2)
  })
})

describe('keys', () => {
  it('GET /v1/keys/:keyId returns pubkey', async () => {
    const a = await seedAuthor('judy')
    const r = await SELF.fetch(`http://test.local/v1/keys/${a.keyId}`)
    expect(r.status).toBe(200)
    const j = (await r.json()) as { keyId: string; pubkeyB64: string }
    expect(j.keyId).toBe(a.keyId)
    expect(j.pubkeyB64).toBe(a.pubB64)
  })
})

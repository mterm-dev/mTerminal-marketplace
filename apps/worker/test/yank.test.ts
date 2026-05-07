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

describe('yank', () => {
  it('marks a version as yanked and prevents download', async () => {
    const a = await seedAuthor('owner')
    const buf = await buildPackage({
      id: 'yankable',
      version: '1.0.0',
      authorId: a.authorId,
      keyId: a.keyId,
      privKey: a.privKey,
    })
    const r1 = await postPackage(buf, a.apiKey)
    expect(r1.status).toBe(200)

    const yank = await SELF.fetch('http://test.local/v1/extensions/yankable/yank/1.0.0', {
      method: 'POST',
      headers: { Authorization: `Bearer ${a.apiKey}` },
    })
    expect(yank.status).toBe(200)

    const dl = await SELF.fetch(
      'http://test.local/v1/extensions/yankable/versions/1.0.0/download',
    )
    expect(dl.status).toBe(410)
  })

  it('rejects yank from a different author', async () => {
    const a = await seedAuthor('rightful')
    const b = await seedAuthor('intruder')
    const buf = await buildPackage({
      id: 'yank-defended',
      version: '1.0.0',
      authorId: a.authorId,
      keyId: a.keyId,
      privKey: a.privKey,
    })
    await postPackage(buf, a.apiKey)
    const yank = await SELF.fetch(
      'http://test.local/v1/extensions/yank-defended/yank/1.0.0',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${b.apiKey}` },
      },
    )
    expect(yank.status).toBe(403)
  })

  it('revoking a key yanks all versions signed by it', async () => {
    const a = await seedAuthor('revoker')
    const buf = await buildPackage({
      id: 'revokable',
      version: '1.0.0',
      authorId: a.authorId,
      keyId: a.keyId,
      privKey: a.privKey,
    })
    await postPackage(buf, a.apiKey)
    const r = await SELF.fetch(`http://test.local/v1/keys/${a.keyId}/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${a.apiKey}` },
    })
    expect(r.status).toBe(200)
    const dl = await SELF.fetch(
      'http://test.local/v1/extensions/revokable/versions/1.0.0/download',
    )
    expect(dl.status).toBe(410)
  })
})

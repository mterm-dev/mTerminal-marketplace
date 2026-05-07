import { describe, expect, it } from 'vitest'
import { SELF } from 'cloudflare:test'
import { buildPackage, seedAuthor, seedSession } from './helpers'

async function publish(authorLogin: string, id: string, version = '1.0.0'): Promise<void> {
  const a = await seedAuthor(authorLogin)
  const buf = await buildPackage({
    id,
    version,
    authorId: a.authorId,
    keyId: a.keyId,
    privKey: a.privKey,
  })
  const fd = new FormData()
  fd.append('package', new Blob([buf], { type: 'application/zip' }), 'demo.mtx')
  await SELF.fetch('http://test.local/v1/publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${a.apiKey}` },
    body: fd,
  })
}

describe('ratings', () => {
  it('rejects unauthenticated submit', async () => {
    const r = await SELF.fetch('http://test.local/v1/ratings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ extensionId: 'x', stars: 5 }),
    })
    expect(r.status).toBe(401)
  })

  it('rejects unknown extension', async () => {
    const session = await seedSession('rater')
    const r = await SELF.fetch('http://test.local/v1/ratings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ extensionId: 'nonexistent', stars: 5 }),
    })
    expect(r.status).toBe(404)
  })

  it('rejects out-of-range stars', async () => {
    await publish('owner-a', 'rated-ext')
    const session = await seedSession('rater')
    const r = await SELF.fetch('http://test.local/v1/ratings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ extensionId: 'rated-ext', stars: 99 }),
    })
    expect(r.status).toBe(400)
  })

  it('accepts a valid rating and lists it back', async () => {
    await publish('owner-b', 'rated-ext-b')
    const session = await seedSession('rater-b')
    const r = await SELF.fetch('http://test.local/v1/ratings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ extensionId: 'rated-ext-b', stars: 4, comment: 'nice' }),
    })
    expect(r.status).toBe(200)
    const list = await SELF.fetch('http://test.local/v1/extensions/rated-ext-b/ratings')
    const j = (await list.json()) as { items: { stars: number; comment?: string }[] }
    expect(j.items.length).toBe(1)
    expect(j.items[0]?.stars).toBe(4)
    expect(j.items[0]?.comment).toBe('nice')
  })

  it('upserts on second submission from the same user', async () => {
    await publish('owner-c', 'rated-ext-c')
    const session = await seedSession('rater-c')
    for (const stars of [3, 5]) {
      await SELF.fetch('http://test.local/v1/ratings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ extensionId: 'rated-ext-c', stars }),
      })
    }
    const list = await SELF.fetch('http://test.local/v1/extensions/rated-ext-c/ratings')
    const j = (await list.json()) as { items: { stars: number }[] }
    expect(j.items.length).toBe(1)
    expect(j.items[0]?.stars).toBe(5)
  })
})

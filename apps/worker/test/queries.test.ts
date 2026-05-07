import { describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import {
  getAuthorById,
  getExtension,
  getVersion,
  searchExtensions,
  upsertAuthor,
  upsertExtension,
  insertVersion,
  upsertRating,
  bumpDownloads,
  insertPublicKey,
  revokePublicKey,
  yankVersionsByKey,
  listVersionsForExtension,
} from '../src/db/queries'

async function seed(authorId: string, login: string): Promise<void> {
  await upsertAuthor(env, {
    id: authorId,
    github_login: login,
    api_key_hash: 'hash-' + authorId,
    banned: 0,
    created_at: Date.now(),
  })
}

async function makeExt(id: string, authorId: string, category = 'other', recommended = 0): Promise<void> {
  const now = Date.now()
  await upsertExtension(env, {
    id,
    author_id: authorId,
    display_name: id,
    description: `desc for ${id}`,
    category,
    icon_url: null,
    homepage_url: null,
    repo_url: null,
    latest_version: '1.0.0',
    curated: 0,
    recommended,
    download_total: 0,
    created_at: now,
    updated_at: now,
  })
}

async function makeKey(authorId: string, keyId: string): Promise<void> {
  await insertPublicKey(env, {
    id: keyId,
    author_id: authorId,
    pubkey_b64: 'pk',
    name: null,
    revoked_at: null,
    created_at: Date.now(),
  })
}

async function makeVersion(extId: string, version: string, keyId: string): Promise<void> {
  await insertVersion(env, {
    ext_id: extId,
    version,
    api_range: '^1.0.0',
    size_bytes: 100,
    sha256: 'aa'.repeat(32),
    signature_b64: 'sig',
    key_id: keyId,
    manifest_json: '{}',
    capabilities: '[]',
    readme_md: null,
    yanked: 0,
    published_at: Date.now(),
  })
}

describe('queries: authors and extensions', () => {
  it('upsertAuthor + getAuthorById round-trips', async () => {
    await seed('gh-1', 'alice')
    const row = await getAuthorById(env, 'gh-1')
    expect(row?.github_login).toBe('alice')
  })

  it('upsertExtension + getExtension round-trips', async () => {
    await seed('gh-1', 'alice')
    await makeExt('foo', 'gh-1')
    const row = await getExtension(env, 'foo')
    expect(row?.display_name).toBe('foo')
  })
})

describe('queries: searchExtensions', () => {
  it('filters by category', async () => {
    await seed('gh-1', 'alice')
    await makeExt('a', 'gh-1', 'theme')
    await makeExt('b', 'gh-1', 'productivity')
    const r = await searchExtensions(env, {
      category: 'theme',
      page: 0,
      pageSize: 20,
    })
    expect(r.total).toBe(1)
    expect(r.items[0]?.id).toBe('a')
  })

  it('filters by recommended', async () => {
    await seed('gh-1', 'alice')
    await makeExt('a', 'gh-1', 'other', 1)
    await makeExt('b', 'gh-1', 'other', 0)
    const r = await searchExtensions(env, {
      recommended: true,
      page: 0,
      pageSize: 20,
    })
    expect(r.total).toBe(1)
    expect(r.items[0]?.id).toBe('a')
  })

  it('filters by ids', async () => {
    await seed('gh-1', 'alice')
    await makeExt('a', 'gh-1')
    await makeExt('b', 'gh-1')
    await makeExt('c', 'gh-1')
    const r = await searchExtensions(env, {
      ids: ['a', 'c'],
      page: 0,
      pageSize: 20,
    })
    expect(r.total).toBe(2)
    expect(r.items.map((x) => x.id).sort()).toEqual(['a', 'c'])
  })

  it('paginates', async () => {
    await seed('gh-1', 'alice')
    for (let i = 0; i < 5; i++) await makeExt(`ext-${i}`, 'gh-1')
    const page0 = await searchExtensions(env, { page: 0, pageSize: 2 })
    const page1 = await searchExtensions(env, { page: 1, pageSize: 2 })
    expect(page0.items.length).toBe(2)
    expect(page1.items.length).toBe(2)
    expect(page0.items[0]?.id).not.toBe(page1.items[0]?.id)
  })

  it('matches free-text query', async () => {
    await seed('gh-1', 'alice')
    await makeExt('alpha', 'gh-1')
    await makeExt('beta', 'gh-1')
    const r = await searchExtensions(env, {
      q: 'alph',
      page: 0,
      pageSize: 20,
    })
    expect(r.total).toBe(1)
    expect(r.items[0]?.id).toBe('alpha')
  })
})

describe('queries: downloads + ratings', () => {
  it('bumpDownloads increments per day and updates total', async () => {
    await seed('gh-1', 'alice')
    await makeExt('foo', 'gh-1')
    await bumpDownloads(env, 'foo', '1.0.0', '2026-01-01')
    await bumpDownloads(env, 'foo', '1.0.0', '2026-01-01')
    const ext = await getExtension(env, 'foo')
    expect(ext?.download_total).toBe(2)
  })

  it('upsertRating overwrites prior rating from the same user', async () => {
    await seed('gh-1', 'alice')
    await makeExt('foo', 'gh-1')
    for (const stars of [3, 5]) {
      await upsertRating(env, {
        ext_id: 'foo',
        user_id: 'gh-99',
        user_login: 'rater',
        stars,
        comment: null,
        helpful: 0,
        created_at: Date.now(),
      })
    }
    const r = await env.DB.prepare('SELECT stars FROM ratings WHERE ext_id = ? AND user_id = ?')
      .bind('foo', 'gh-99')
      .first<{ stars: number }>()
    expect(r?.stars).toBe(5)
  })
})

describe('queries: keys and yanking', () => {
  it('revokePublicKey + yankVersionsByKey marks versions yanked', async () => {
    await seed('gh-1', 'alice')
    await makeKey('gh-1', 'gh-1:key1')
    await makeExt('foo', 'gh-1')
    await makeVersion('foo', '1.0.0', 'gh-1:key1')
    await makeVersion('foo', '1.1.0', 'gh-1:key1')

    await revokePublicKey(env, 'gh-1:key1', Date.now())
    await yankVersionsByKey(env, 'gh-1:key1')

    const versions = await listVersionsForExtension(env, 'foo')
    expect(versions.every((v) => v.yanked === 1)).toBe(true)
  })

  it('getVersion returns null for missing version', async () => {
    expect(await getVersion(env, 'no-such', '0.0.0')).toBeNull()
  })
})

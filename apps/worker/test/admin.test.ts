import { describe, expect, it } from 'vitest'
import { SELF, env } from 'cloudflare:test'
import { seedAuthor } from './helpers'

async function devLogin(login = 'admin-tester'): Promise<string> {
  const r = await SELF.fetch('http://test.local/v1/admin/auth/dev-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login }),
  })
  expect(r.status).toBe(200)
  const setCookie = r.headers.get('set-cookie') ?? ''
  const m = /admin_session=([^;]+)/.exec(setCookie)
  expect(m).not.toBeNull()
  return m![1]!
}

async function csrfFor(token: string): Promise<string> {
  const r = await SELF.fetch('http://test.local/v1/admin/me', {
    headers: { cookie: `admin_session=${token}` },
  })
  const j = (await r.json()) as { csrfToken: string }
  return j.csrfToken
}

function authHeaders(token: string): Record<string, string> {
  return { cookie: `admin_session=${token}` }
}

async function mutateHeaders(
  token: string,
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const csrf = await csrfFor(token)
  return { cookie: `admin_session=${token}`, 'x-csrf-token': csrf, ...extra }
}

async function seedExtension(opts: {
  id: string
  authorId: string
  keyId: string
  category?: string
  curated?: boolean
  recommended?: boolean
  downloadTotal?: number
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO extensions (id, author_id, display_name, description, category, icon_url, homepage_url, repo_url, latest_version, curated, recommended, download_total, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, NULL, NULL, NULL, '1.0.0', ?, ?, ?, ?, ?)`,
  )
    .bind(
      opts.id,
      opts.authorId,
      opts.id,
      opts.category ?? 'other',
      opts.curated ? 1 : 0,
      opts.recommended ? 1 : 0,
      opts.downloadTotal ?? 0,
      Date.now(),
      Date.now(),
    )
    .run()
  await env.DB.prepare(
    `INSERT INTO versions (ext_id, version, api_range, size_bytes, sha256, signature_b64, key_id, manifest_json, capabilities, readme_md, yanked, published_at)
     VALUES (?, '1.0.0', '^1.0.0', 1024, 'deadbeef', 'sig', ?, '{}', '[]', NULL, 0, ?)`,
  )
    .bind(opts.id, opts.keyId, Date.now())
    .run()
}

describe('admin auth', () => {
  it('returns 401 without session cookie', async () => {
    const r = await SELF.fetch('http://test.local/v1/admin/dashboard')
    expect(r.status).toBe(401)
  })

  it('rejects logins not on the allowlist', async () => {
    const r = await SELF.fetch('http://test.local/v1/admin/auth/dev-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'someone-random' }),
    })
    expect(r.status).toBe(403)
  })

  it('dev-login + cookie grants access to /me', async () => {
    const token = await devLogin('admin-tester')
    const r = await SELF.fetch('http://test.local/v1/admin/me', {
      headers: authHeaders(token),
    })
    expect(r.status).toBe(200)
    const j = (await r.json()) as { login: string }
    expect(j.login).toBe('admin-tester')
  })

  it('logout clears the session', async () => {
    const token = await devLogin()
    const out = await SELF.fetch('http://test.local/v1/admin/auth/logout', {
      method: 'POST',
      headers: authHeaders(token),
    })
    expect(out.status).toBe(200)
    const r = await SELF.fetch('http://test.local/v1/admin/me', {
      headers: authHeaders(token),
    })
    expect(r.status).toBe(401)
  })

  it('github start redirects to github when configured', async () => {
    const r = await SELF.fetch('http://test.local/v1/admin/auth/github/start', {
      redirect: 'manual',
    })
    expect(r.status).toBe(302)
    const loc = r.headers.get('location') ?? ''
    expect(loc).toContain('github.com/login/oauth/authorize')
    expect(loc).toContain('client_id=test-client-id')
  })
})

describe('admin dashboard', () => {
  it('returns metric counters', async () => {
    const author = await seedAuthor('alice')
    await seedExtension({
      id: 'a',
      authorId: author.authorId,
      keyId: author.keyId,
      downloadTotal: 50,
    })
    const today = new Date().toISOString().slice(0, 10)
    await env.DB.prepare(
      `INSERT INTO downloads (ext_id, version, day, count) VALUES (?, '1.0.0', ?, 5)`,
    )
      .bind('a', today)
      .run()

    const token = await devLogin()
    const r = await SELF.fetch('http://test.local/v1/admin/dashboard', {
      headers: authHeaders(token),
    })
    expect(r.status).toBe(200)
    const j = (await r.json()) as {
      extensionsTotal: number
      versionsTotal: number
      authorsTotal: number
      downloadsLast7d: number
      pendingReports: number
      topExtensions: Array<{ id: string; downloadTotal: number }>
      recentVersions: Array<{ extId: string; version: string }>
    }
    expect(j.extensionsTotal).toBe(1)
    expect(j.versionsTotal).toBe(1)
    expect(j.authorsTotal).toBe(1)
    expect(j.downloadsLast7d).toBe(5)
    expect(j.pendingReports).toBe(0)
    expect(j.topExtensions[0]?.id).toBe('a')
    expect(j.recentVersions[0]?.extId).toBe('a')
  })
})

describe('admin extensions list', () => {
  it('lists all extensions with overrides applied', async () => {
    const author = await seedAuthor('bob')
    await seedExtension({
      id: 'one',
      authorId: author.authorId,
      keyId: author.keyId,
      downloadTotal: 100,
      curated: true,
    })
    await seedExtension({
      id: 'two',
      authorId: author.authorId,
      keyId: author.keyId,
      downloadTotal: 5,
      recommended: true,
    })

    const token = await devLogin()
    const r = await SELF.fetch('http://test.local/v1/admin/extensions', {
      headers: authHeaders(token),
    })
    expect(r.status).toBe(200)
    const j = (await r.json()) as {
      items: Array<{ id: string; curated: boolean; recommended: boolean }>
      total: number
    }
    expect(j.total).toBe(2)
    expect(j.items[0]?.id).toBe('one')
    expect(j.items[0]?.curated).toBe(true)
    expect(j.items[1]?.recommended).toBe(true)
  })

  it('filters by curated and recommended', async () => {
    const author = await seedAuthor('carol')
    await seedExtension({
      id: 'cur',
      authorId: author.authorId,
      keyId: author.keyId,
      curated: true,
    })
    await seedExtension({
      id: 'plain',
      authorId: author.authorId,
      keyId: author.keyId,
    })

    const token = await devLogin()
    const r = await SELF.fetch(
      'http://test.local/v1/admin/extensions?curated=1',
      { headers: authHeaders(token) },
    )
    const j = (await r.json()) as { items: Array<{ id: string }> }
    expect(j.items.map((i) => i.id)).toEqual(['cur'])
  })
})

describe('admin extension mutations', () => {
  it('patches curated/recommended/category', async () => {
    const author = await seedAuthor('dan')
    await seedExtension({
      id: 'ext1',
      authorId: author.authorId,
      keyId: author.keyId,
    })
    const token = await devLogin()
    const r = await SELF.fetch('http://test.local/v1/admin/extensions/ext1', {
      method: 'PATCH',
      headers: await mutateHeaders(token, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        curated: true,
        recommended: true,
        category: 'productivity',
        displayName: 'Custom',
        description: 'desc',
      }),
    })
    expect(r.status).toBe(200)
    const row = await env.DB.prepare('SELECT * FROM extensions WHERE id = ?')
      .bind('ext1')
      .first<{
        curated: number
        recommended: number
        category: string
        display_name: string
      }>()
    expect(row?.curated).toBe(1)
    expect(row?.recommended).toBe(1)
    expect(row?.category).toBe('productivity')
    expect(row?.display_name).toBe('Custom')
    const audit = await env.DB.prepare(
      'SELECT * FROM admin_audit ORDER BY id DESC LIMIT 1',
    ).first<{ action: string; target: string }>()
    expect(audit?.action).toBe('extension.update')
    expect(audit?.target).toBe('ext1')
  })

  it('deletes extension cascading versions and ratings', async () => {
    const author = await seedAuthor('erin')
    await seedExtension({
      id: 'gone',
      authorId: author.authorId,
      keyId: author.keyId,
    })
    await env.DB.prepare(
      `INSERT INTO ratings (ext_id, user_id, user_login, stars, comment, helpful, created_at)
       VALUES ('gone', 'u1', 'u1', 5, NULL, 0, ?)`,
    )
      .bind(Date.now())
      .run()
    await env.PACKAGES.put('extensions/gone/1.0.0.mtx', new Uint8Array([1, 2, 3]))

    const token = await devLogin()
    const r = await SELF.fetch('http://test.local/v1/admin/extensions/gone', {
      method: 'DELETE',
      headers: await mutateHeaders(token),
    })
    expect(r.status).toBe(200)
    const ext = await env.DB.prepare('SELECT * FROM extensions WHERE id = ?')
      .bind('gone')
      .first()
    expect(ext).toBeNull()
    const ratings = await env.DB.prepare('SELECT COUNT(*) AS c FROM ratings WHERE ext_id = ?')
      .bind('gone')
      .first<{ c: number }>()
    expect(ratings?.c).toBe(0)
    const pending = await env.DB.prepare(
      `SELECT key FROM pending_r2_cleanup WHERE key = 'extensions/gone/1.0.0.mtx'`,
    ).first<{ key: string }>()
    expect(pending?.key).toBe('extensions/gone/1.0.0.mtx')
  })

  it('yanks and unyanks versions with audit', async () => {
    const author = await seedAuthor('frank')
    await seedExtension({
      id: 'yk',
      authorId: author.authorId,
      keyId: author.keyId,
    })
    const token = await devLogin()
    const y = await SELF.fetch(
      'http://test.local/v1/admin/extensions/yk/versions/1.0.0/yank',
      {
        method: 'POST',
        headers: await mutateHeaders(token, { 'content-type': 'application/json' }),
        body: JSON.stringify({ reason: 'malware' }),
      },
    )
    expect(y.status).toBe(200)
    let row = await env.DB.prepare(
      'SELECT yanked FROM versions WHERE ext_id = ? AND version = ?',
    )
      .bind('yk', '1.0.0')
      .first<{ yanked: number }>()
    expect(row?.yanked).toBe(1)

    const u = await SELF.fetch(
      'http://test.local/v1/admin/extensions/yk/versions/1.0.0/unyank',
      { method: 'POST', headers: await mutateHeaders(token) },
    )
    expect(u.status).toBe(200)
    row = await env.DB.prepare(
      'SELECT yanked FROM versions WHERE ext_id = ? AND version = ?',
    )
      .bind('yk', '1.0.0')
      .first<{ yanked: number }>()
    expect(row?.yanked).toBe(0)
  })
})

describe('admin authors', () => {
  it('lists authors with counts', async () => {
    const a = await seedAuthor('gail')
    await seedExtension({
      id: 'g1',
      authorId: a.authorId,
      keyId: a.keyId,
      downloadTotal: 9,
    })
    const token = await devLogin()
    const r = await SELF.fetch('http://test.local/v1/admin/authors', {
      headers: authHeaders(token),
    })
    const j = (await r.json()) as {
      items: Array<{
        id: string
        githubLogin: string
        extensionsCount: number
        totalDownloads: number
      }>
    }
    expect(j.items[0]?.githubLogin).toBe('gail')
    expect(j.items[0]?.extensionsCount).toBe(1)
    expect(j.items[0]?.totalDownloads).toBe(9)
  })

  it('bans and unbans an author', async () => {
    const a = await seedAuthor('hank')
    const token = await devLogin()
    const ban = await SELF.fetch(
      `http://test.local/v1/admin/authors/${a.authorId}/ban`,
      { method: 'POST', headers: await mutateHeaders(token) },
    )
    expect(ban.status).toBe(200)
    let row = await env.DB.prepare('SELECT banned FROM authors WHERE id = ?')
      .bind(a.authorId)
      .first<{ banned: number }>()
    expect(row?.banned).toBe(1)
    await SELF.fetch(`http://test.local/v1/admin/authors/${a.authorId}/unban`, {
      method: 'POST',
      headers: await mutateHeaders(token),
    })
    row = await env.DB.prepare('SELECT banned FROM authors WHERE id = ?')
      .bind(a.authorId)
      .first<{ banned: number }>()
    expect(row?.banned).toBe(0)
  })

  it('rotates api key (changes hash)', async () => {
    const a = await seedAuthor('iris')
    const token = await devLogin()
    const r = await SELF.fetch(
      `http://test.local/v1/admin/authors/${a.authorId}/revoke-api-key`,
      { method: 'POST', headers: await mutateHeaders(token) },
    )
    expect(r.status).toBe(200)
    const row = await env.DB.prepare('SELECT api_key_hash FROM authors WHERE id = ?')
      .bind(a.authorId)
      .first<{ api_key_hash: string }>()
    expect(row?.api_key_hash).not.toBe(a.apiKeyHash)
  })

  it('revokes all public keys (sets revoked_at and yanks versions)', async () => {
    const a = await seedAuthor('jane')
    await seedExtension({
      id: 'jx',
      authorId: a.authorId,
      keyId: a.keyId,
    })
    const token = await devLogin()
    const r = await SELF.fetch(
      `http://test.local/v1/admin/authors/${a.authorId}/revoke-all-keys`,
      { method: 'POST', headers: await mutateHeaders(token) },
    )
    expect(r.status).toBe(200)
    const k = await env.DB.prepare(
      'SELECT revoked_at FROM public_keys WHERE author_id = ?',
    )
      .bind(a.authorId)
      .first<{ revoked_at: number | null }>()
    expect(k?.revoked_at).not.toBeNull()
    const v = await env.DB.prepare('SELECT yanked FROM versions WHERE ext_id = ?')
      .bind('jx')
      .first<{ yanked: number }>()
    expect(v?.yanked).toBe(1)
  })
})

describe('admin ratings', () => {
  it('hides and deletes a rating', async () => {
    const a = await seedAuthor('kyle')
    await seedExtension({
      id: 'rx',
      authorId: a.authorId,
      keyId: a.keyId,
    })
    await env.DB.prepare(
      `INSERT INTO ratings (ext_id, user_id, user_login, stars, comment, helpful, created_at)
       VALUES ('rx', 'u1', 'u1', 1, 'bad', 0, ?)`,
    )
      .bind(Date.now())
      .run()
    const token = await devLogin()
    const hide = await SELF.fetch(
      'http://test.local/v1/admin/ratings/rx/u1/hide',
      { method: 'POST', headers: await mutateHeaders(token) },
    )
    expect(hide.status).toBe(200)
    let row = await env.DB.prepare(
      'SELECT helpful FROM ratings WHERE ext_id = ? AND user_id = ?',
    )
      .bind('rx', 'u1')
      .first<{ helpful: number }>()
    expect(row?.helpful).toBe(-1)

    const del = await SELF.fetch('http://test.local/v1/admin/ratings/rx/u1', {
      method: 'DELETE',
      headers: await mutateHeaders(token),
    })
    expect(del.status).toBe(200)
    row = await env.DB.prepare(
      'SELECT helpful FROM ratings WHERE ext_id = ? AND user_id = ?',
    )
      .bind('rx', 'u1')
      .first<{ helpful: number }>()
    expect(row).toBeNull()
  })
})

describe('admin audit log', () => {
  it('returns audit entries chronologically', async () => {
    const a = await seedAuthor('liam')
    await seedExtension({
      id: 'au',
      authorId: a.authorId,
      keyId: a.keyId,
    })
    const token = await devLogin('admin-tester')
    await SELF.fetch('http://test.local/v1/admin/extensions/au', {
      method: 'PATCH',
      headers: await mutateHeaders(token, { 'content-type': 'application/json' }),
      body: JSON.stringify({ curated: true }),
    })
    await SELF.fetch(`http://test.local/v1/admin/authors/${a.authorId}/ban`, {
      method: 'POST',
      headers: await mutateHeaders(token),
    })
    const r = await SELF.fetch('http://test.local/v1/admin/audit', {
      headers: authHeaders(token),
    })
    expect(r.status).toBe(200)
    const j = (await r.json()) as {
      items: Array<{ adminLogin: string; action: string; target: string }>
      total: number
    }
    expect(j.total).toBe(2)
    expect(j.items[0]?.adminLogin).toBe('admin-tester')
    expect(j.items.map((i) => i.action).sort()).toEqual([
      'author.ban',
      'extension.update',
    ])
  })
})

describe('admin csrf protection', () => {
  it('rejects PATCH without csrf header (403)', async () => {
    const author = await seedAuthor('csrf-a')
    await seedExtension({
      id: 'csrf-ext',
      authorId: author.authorId,
      keyId: author.keyId,
    })
    const token = await devLogin()
    const r = await SELF.fetch('http://test.local/v1/admin/extensions/csrf-ext', {
      method: 'PATCH',
      headers: { ...authHeaders(token), 'content-type': 'application/json' },
      body: JSON.stringify({ curated: true }),
    })
    expect(r.status).toBe(403)
    const j = (await r.json()) as { error: string }
    expect(j.error).toBe('csrf token invalid')
  })

  it('rejects POST with bad csrf header (403)', async () => {
    const author = await seedAuthor('csrf-b')
    await seedExtension({
      id: 'csrf-ext-b',
      authorId: author.authorId,
      keyId: author.keyId,
    })
    const token = await devLogin()
    const r = await SELF.fetch(
      'http://test.local/v1/admin/extensions/csrf-ext-b/versions/1.0.0/yank',
      {
        method: 'POST',
        headers: {
          ...authHeaders(token),
          'content-type': 'application/json',
          'x-csrf-token': 'wrong-token',
        },
        body: JSON.stringify({ reason: 'x' }),
      },
    )
    expect(r.status).toBe(403)
  })

  it('accepts mutating request with valid csrf header', async () => {
    const author = await seedAuthor('csrf-c')
    await seedExtension({
      id: 'csrf-ext-c',
      authorId: author.authorId,
      keyId: author.keyId,
    })
    const token = await devLogin()
    const csrf = await csrfFor(token)
    const r = await SELF.fetch('http://test.local/v1/admin/extensions/csrf-ext-c', {
      method: 'PATCH',
      headers: {
        ...authHeaders(token),
        'content-type': 'application/json',
        'x-csrf-token': csrf,
      },
      body: JSON.stringify({ curated: true }),
    })
    expect(r.status).toBe(200)
  })

  it('exposes csrfToken on /me', async () => {
    const token = await devLogin()
    const r = await SELF.fetch('http://test.local/v1/admin/me', {
      headers: authHeaders(token),
    })
    const j = (await r.json()) as { csrfToken?: string }
    expect(typeof j.csrfToken).toBe('string')
    expect(j.csrfToken!.length).toBeGreaterThanOrEqual(32)
  })
})

describe('admin dev-login env guard', () => {
  it('isDevLoginEnabled returns false when env var is not "1"', async () => {
    const { isDevLoginEnabled } = await import('../src/lib/admin-auth')
    const fakeEnv = { ADMIN_DEV_LOGIN: '0' } as unknown as typeof env
    expect(isDevLoginEnabled(fakeEnv)).toBe(false)
    const undef = {} as unknown as typeof env
    expect(isDevLoginEnabled(undef)).toBe(false)
  })

  it('isDevLoginEnabled returns true when env var is "1"', async () => {
    const { isDevLoginEnabled } = await import('../src/lib/admin-auth')
    const fakeEnv = { ADMIN_DEV_LOGIN: '1' } as unknown as typeof env
    expect(isDevLoginEnabled(fakeEnv)).toBe(true)
  })

  it('worker accepts dev-login when ADMIN_DEV_LOGIN is "1" (current test env)', async () => {
    expect(env.ADMIN_DEV_LOGIN).toBe('1')
    const r = await SELF.fetch('http://test.local/v1/admin/auth/dev-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'admin-tester' }),
    })
    expect(r.status).toBe(200)
  })
})

describe('admin oauth state multi-tab', () => {
  it('two concurrent github-start calls each get their own state and KV entry', async () => {
    const r1 = await SELF.fetch('http://test.local/v1/admin/auth/github/start', {
      redirect: 'manual',
    })
    const r2 = await SELF.fetch('http://test.local/v1/admin/auth/github/start', {
      redirect: 'manual',
    })
    const s1 = new URL(r1.headers.get('location') ?? '').searchParams.get('state')!
    const s2 = new URL(r2.headers.get('location') ?? '').searchParams.get('state')!
    expect(s1).not.toBe(s2)
    const k1 = await env.SESSIONS.get(`admin-oauth:${s1}`)
    const k2 = await env.SESSIONS.get(`admin-oauth:${s2}`)
    expect(k1).not.toBeNull()
    expect(k2).not.toBeNull()
  })
})

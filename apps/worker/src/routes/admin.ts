import { Hono } from 'hono'
import type { Env } from '../env'
import {
  ADMIN_COOKIE_NAME,
  buildClearSessionCookie,
  buildOAuthStateCookie,
  buildSessionCookie,
  deleteAdminSession,
  isAdminLogin,
  isDevLoginEnabled,
  newCsrfToken,
  newOAuthState,
  newSessionToken,
  parseCookies,
  readAdminSession,
  writeAdminSession,
  type AdminSession,
} from '../lib/admin-auth'
import { clientIp, rateLimit } from '../lib/ratelimit'
import { schedulePackageDeletion } from '../lib/r2-cleanup'
import {
  adminDeleteExtension,
  adminListAuthors,
  adminListExtensions,
  adminUpdateExtension,
  appendAudit,
  deleteRating,
  getDashboardMetrics,
  listAudit,
  revokeAllAuthorPublicKeys,
  rotateAuthorApiKeyHash,
  setAuthorBanned,
  setRatingHidden,
  setVersionYank,
  type AdminExtensionPatch,
} from '../db/admin-queries'
import {
  getAuthorById,
  getExtension,
  getExtensionWithStats,
  getVersion,
  listRatings,
  listVersionsForExtension,
} from '../db/queries'
import { generateApiKey, hashApiKey } from '../lib/jwt'
import { packageKey, pubkeyKey } from '../lib/r2'

type Variables = {
  admin: AdminSession
}

export const adminRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()

function isSecureRequest(req: Request): boolean {
  const proto = req.headers.get('x-forwarded-proto')
  if (proto === 'https') return true
  try {
    const u = new URL(req.url)
    return u.protocol === 'https:'
  } catch {
    return false
  }
}

function adminBaseUrl(env: Env, req: Request): string {
  if (env.ADMIN_BASE_URL) return env.ADMIN_BASE_URL.replace(/\/+$/, '')
  try {
    const u = new URL(req.url)
    return `${u.protocol}//${u.host}`
  } catch {
    return ''
  }
}

adminRoutes.get('/auth/github/start', async (c) => {
  const ip = clientIp(c.req.raw.headers)
  const rl = await rateLimit(c.env, `admin-gh-start:${ip}`, 30, 3600)
  if (!rl.ok) {
    c.header('Retry-After', String(Math.max(1, rl.resetAt - Math.floor(Date.now() / 1000))))
    return c.json({ error: 'rate limited' }, 429)
  }
  const clientId = c.env.ADMIN_GITHUB_CLIENT_ID
  if (!clientId || clientId === 'replace-me') {
    return c.json({ error: 'admin oauth not configured' }, 500)
  }
  const state = newOAuthState()
  const secure = isSecureRequest(c.req.raw)
  await c.env.SESSIONS.put(
    `admin-oauth:${state}`,
    JSON.stringify({ createdAt: Date.now() }),
    { expirationTtl: 600 },
  )
  const redirectUri = `${adminBaseUrl(c.env, c.req.raw)}/v1/admin/auth/github/callback`
  const u = new URL('https://github.com/login/oauth/authorize')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('scope', 'read:user')
  u.searchParams.set('state', state)
  u.searchParams.set('allow_signup', 'false')
  c.header('Set-Cookie', buildOAuthStateCookie(state, secure))
  return c.redirect(u.toString(), 302)
})

adminRoutes.get('/auth/github/callback', async (c) => {
  const url = new URL(c.req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return c.json({ error: 'missing code or state' }, 400)

  const stored = await c.env.SESSIONS.get(`admin-oauth:${state}`)
  if (!stored) return c.json({ error: 'state expired' }, 400)
  await c.env.SESSIONS.delete(`admin-oauth:${state}`)

  const clientId = c.env.ADMIN_GITHUB_CLIENT_ID
  const clientSecret = c.env.ADMIN_GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return c.json({ error: 'admin oauth not configured' }, 500)
  }

  const redirectUri = `${adminBaseUrl(c.env, c.req.raw)}/v1/admin/auth/github/callback`
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!tokenRes.ok) return c.json({ error: 'github token exchange failed' }, 500)
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string }
  if (!tokenJson.access_token) return c.json({ error: 'no access token' }, 500)

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'mterminal-marketplace-admin',
    },
  })
  if (!userRes.ok) return c.json({ error: 'github user lookup failed' }, 500)
  const user = (await userRes.json()) as { id: number; login: string }

  if (!isAdminLogin(c.env, user.login)) {
    return c.redirect('/admin/login?error=forbidden', 302)
  }

  const token = newSessionToken()
  await writeAdminSession(c.env, token, {
    login: user.login,
    githubUserId: user.id,
    createdAt: Date.now(),
    csrfToken: newCsrfToken(),
  })
  const secure = isSecureRequest(c.req.raw)
  c.header('Set-Cookie', buildSessionCookie(token, secure))
  return c.redirect('/admin/', 302)
})

adminRoutes.post('/auth/dev-login', async (c) => {
  if (!isDevLoginEnabled(c.env)) {
    return c.json({ error: 'not found' }, 404)
  }
  const ip = clientIp(c.req.raw.headers)
  const rl = await rateLimit(c.env, `admin-dev-login:${ip}`, 20, 3600)
  if (!rl.ok) {
    c.header('Retry-After', String(Math.max(1, rl.resetAt - Math.floor(Date.now() / 1000))))
    return c.json({ error: 'rate limited' }, 429)
  }
  const body = (await c.req.json().catch(() => null)) as { login?: string } | null
  if (!body?.login) return c.json({ error: 'login required' }, 400)
  if (!isAdminLogin(c.env, body.login)) {
    return c.json({ error: 'forbidden' }, 403)
  }
  const token = newSessionToken()
  await writeAdminSession(c.env, token, {
    login: body.login,
    githubUserId: 0,
    createdAt: Date.now(),
    csrfToken: newCsrfToken(),
  })
  const secure = isSecureRequest(c.req.raw)
  c.header('Set-Cookie', buildSessionCookie(token, secure))
  return c.json({ ok: true, login: body.login, token })
})

adminRoutes.post('/auth/logout', async (c) => {
  const cookies = parseCookies(c.req.header('cookie') ?? null)
  const token = cookies[ADMIN_COOKIE_NAME]
  if (token) await deleteAdminSession(c.env, token)
  const secure = isSecureRequest(c.req.raw)
  c.header('Set-Cookie', buildClearSessionCookie(secure))
  return c.json({ ok: true })
})

adminRoutes.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/v1/admin/auth/')) return next()

  const cookies = parseCookies(c.req.header('cookie') ?? null)
  const token = cookies[ADMIN_COOKIE_NAME]
  if (!token) return c.json({ error: 'unauthorized' }, 401)
  const session = await readAdminSession(c.env, token)
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  if (!isAdminLogin(c.env, session.login)) {
    return c.json({ error: 'forbidden' }, 403)
  }
  c.set('admin', session)

  const method = c.req.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const header = c.req.header('x-csrf-token')
    if (!header || !session.csrfToken || header !== session.csrfToken) {
      return c.json({ error: 'csrf token invalid' }, 403)
    }
  }
  return next()
})

adminRoutes.get('/me', (c) => {
  const a = c.get('admin')
  return c.json({
    login: a.login,
    githubUserId: a.githubUserId,
    createdAt: a.createdAt,
    csrfToken: a.csrfToken,
  })
})

adminRoutes.get('/dashboard', async (c) => {
  const m = await getDashboardMetrics(c.env)
  return c.json(m)
})

adminRoutes.get('/extensions', async (c) => {
  const url = new URL(c.req.url)
  const q = url.searchParams.get('q') ?? undefined
  const category = url.searchParams.get('category') ?? undefined
  const curatedRaw = url.searchParams.get('curated')
  const recommendedRaw = url.searchParams.get('recommended')
  const sort = (url.searchParams.get('sort') as
    | 'downloads'
    | 'recent'
    | 'rating'
    | 'name'
    | null) ?? undefined
  const page = Math.max(0, Number(url.searchParams.get('page') ?? '0'))
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? '40')),
  )
  const filter = {
    q,
    category,
    curated: curatedRaw == null ? undefined : curatedRaw === '1',
    recommended: recommendedRaw == null ? undefined : recommendedRaw === '1',
    sort,
    page,
    pageSize,
  }
  const { items, total } = await adminListExtensions(c.env, filter)
  return c.json({
    items: items.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      description: r.description,
      category: r.category,
      iconUrl: r.icon_url,
      authorId: r.author_id,
      authorLogin: r.github_login,
      latestVersion: r.latest_version,
      downloadTotal: r.download_total,
      curated: !!r.curated,
      recommended: !!r.recommended,
      avgStars: r.rating_count > 0 ? r.avg_stars : null,
      ratingCount: r.rating_count,
      versionCount: r.version_count,
      updatedAt: r.updated_at,
    })),
    total,
    page,
    pageSize,
  })
})

adminRoutes.get('/extensions/:id', async (c) => {
  const id = c.req.param('id')
  const ext = await getExtensionWithStats(c.env, id)
  if (!ext) return c.json({ error: 'not found' }, 404)
  const versions = await listVersionsForExtension(c.env, id)
  const ratings = await listRatings(c.env, id, 0, 100)
  return c.json({
    id: ext.id,
    displayName: ext.display_name,
    description: ext.description,
    category: ext.category,
    iconUrl: ext.icon_url,
    homepageUrl: ext.homepage_url,
    repoUrl: ext.repo_url,
    authorId: ext.author_id,
    authorLogin: ext.github_login,
    latestVersion: ext.latest_version,
    downloadTotal: ext.download_total,
    curated: !!ext.curated,
    recommended: !!ext.recommended,
    avgStars: ext.rating_count > 0 ? ext.avg_stars : null,
    ratingCount: ext.rating_count,
    createdAt: ext.created_at,
    updatedAt: ext.updated_at,
    versions: versions.map((v) => ({
      version: v.version,
      apiRange: v.api_range,
      sizeBytes: v.size_bytes,
      sha256: v.sha256,
      keyId: v.key_id,
      yanked: !!v.yanked,
      publishedAt: v.published_at,
    })),
    ratings: ratings.map((r) => ({
      userId: r.user_id,
      userLogin: r.user_login,
      stars: r.stars,
      comment: r.comment,
      helpful: r.helpful,
      hidden: r.helpful < 0,
      createdAt: r.created_at,
    })),
  })
})

adminRoutes.patch('/extensions/:id', async (c) => {
  const id = c.req.param('id')
  const ext = await getExtension(c.env, id)
  if (!ext) return c.json({ error: 'not found' }, 404)
  const body = (await c.req.json().catch(() => null)) as AdminExtensionPatch | null
  if (!body) return c.json({ error: 'invalid body' }, 400)
  const patch: AdminExtensionPatch = {}
  if (typeof body.curated === 'boolean') patch.curated = body.curated
  if (typeof body.recommended === 'boolean') patch.recommended = body.recommended
  if (typeof body.category === 'string') patch.category = body.category
  if (typeof body.displayName === 'string') patch.displayName = body.displayName
  if (typeof body.description === 'string') patch.description = body.description
  if (body.iconUrl === null || typeof body.iconUrl === 'string')
    patch.iconUrl = body.iconUrl
  await adminUpdateExtension(c.env, id, patch)
  await appendAudit(c.env, c.get('admin').login, 'extension.update', id, patch)
  return c.json({ ok: true })
})

adminRoutes.delete('/extensions/:id', async (c) => {
  const id = c.req.param('id')
  const ext = await getExtension(c.env, id)
  if (!ext) return c.json({ error: 'not found' }, 404)
  const versions = await adminDeleteExtension(c.env, id)
  await schedulePackageDeletion(
    c.env,
    versions.map((v) => packageKey(id, v)),
  )
  await appendAudit(c.env, c.get('admin').login, 'extension.delete', id, {
    versions,
  })
  return c.json({ ok: true, deletedVersions: versions })
})

adminRoutes.post('/extensions/:id/versions/:ver/yank', async (c) => {
  const id = c.req.param('id')
  const ver = c.req.param('ver')
  const v = await getVersion(c.env, id, ver)
  if (!v) return c.json({ error: 'version not found' }, 404)
  const body = (await c.req.json().catch(() => null)) as { reason?: string } | null
  await setVersionYank(c.env, id, ver, true)
  await appendAudit(c.env, c.get('admin').login, 'version.yank', `${id}@${ver}`, {
    reason: body?.reason ?? null,
  })
  return c.json({ ok: true })
})

adminRoutes.post('/extensions/:id/versions/:ver/unyank', async (c) => {
  const id = c.req.param('id')
  const ver = c.req.param('ver')
  const v = await getVersion(c.env, id, ver)
  if (!v) return c.json({ error: 'version not found' }, 404)
  await setVersionYank(c.env, id, ver, false)
  await appendAudit(c.env, c.get('admin').login, 'version.unyank', `${id}@${ver}`, null)
  return c.json({ ok: true })
})

adminRoutes.get('/authors', async (c) => {
  const url = new URL(c.req.url)
  const q = url.searchParams.get('q') ?? undefined
  const page = Math.max(0, Number(url.searchParams.get('page') ?? '0'))
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? '40')),
  )
  const { items, total } = await adminListAuthors(c.env, q, page, pageSize)
  return c.json({
    items: items.map((a) => ({
      id: a.id,
      githubLogin: a.github_login,
      banned: !!a.banned,
      createdAt: a.created_at,
      extensionsCount: a.extensions_count,
      totalDownloads: a.total_downloads,
    })),
    total,
    page,
    pageSize,
  })
})

adminRoutes.post('/authors/:id/ban', async (c) => {
  const id = c.req.param('id')
  const a = await getAuthorById(c.env, id)
  if (!a) return c.json({ error: 'not found' }, 404)
  await setAuthorBanned(c.env, id, true)
  await appendAudit(c.env, c.get('admin').login, 'author.ban', id, {
    login: a.github_login,
  })
  return c.json({ ok: true })
})

adminRoutes.post('/authors/:id/unban', async (c) => {
  const id = c.req.param('id')
  const a = await getAuthorById(c.env, id)
  if (!a) return c.json({ error: 'not found' }, 404)
  await setAuthorBanned(c.env, id, false)
  await appendAudit(c.env, c.get('admin').login, 'author.unban', id, {
    login: a.github_login,
  })
  return c.json({ ok: true })
})

adminRoutes.post('/authors/:id/revoke-api-key', async (c) => {
  const id = c.req.param('id')
  const a = await getAuthorById(c.env, id)
  if (!a) return c.json({ error: 'not found' }, 404)
  const newKey = generateApiKey()
  await rotateAuthorApiKeyHash(c.env, id, hashApiKey(newKey))
  await appendAudit(c.env, c.get('admin').login, 'author.revoke-api-key', id, {
    login: a.github_login,
  })
  return c.json({ ok: true })
})

adminRoutes.post('/authors/:id/revoke-all-keys', async (c) => {
  const id = c.req.param('id')
  const a = await getAuthorById(c.env, id)
  if (!a) return c.json({ error: 'not found' }, 404)
  const now = Date.now()
  await revokeAllAuthorPublicKeys(c.env, id, now)
  try {
    const keys = await c.env.DB.prepare('SELECT id FROM public_keys WHERE author_id = ?')
      .bind(id)
      .all<{ id: string }>()
    await schedulePackageDeletion(
      c.env,
      (keys.results ?? []).map((k) => pubkeyKey(k.id)),
    )
  } catch {}
  await appendAudit(c.env, c.get('admin').login, 'author.revoke-all-keys', id, {
    login: a.github_login,
  })
  return c.json({ ok: true })
})

adminRoutes.get('/audit', async (c) => {
  const url = new URL(c.req.url)
  const page = Math.max(0, Number(url.searchParams.get('page') ?? '0'))
  const pageSize = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? '50')),
  )
  const { items, total } = await listAudit(c.env, page, pageSize)
  return c.json({
    items: items.map((r) => ({
      id: r.id,
      adminLogin: r.admin_login,
      action: r.action,
      target: r.target,
      payload: r.payload_json ? safeParse(r.payload_json) : null,
      createdAt: r.created_at,
    })),
    total,
    page,
    pageSize,
  })
})

adminRoutes.post('/ratings/:extId/:userId/hide', async (c) => {
  const extId = c.req.param('extId')
  const userId = c.req.param('userId')
  await setRatingHidden(c.env, extId, userId)
  await appendAudit(c.env, c.get('admin').login, 'rating.hide', `${extId}/${userId}`, null)
  return c.json({ ok: true })
})

adminRoutes.delete('/ratings/:extId/:userId', async (c) => {
  const extId = c.req.param('extId')
  const userId = c.req.param('userId')
  await deleteRating(c.env, extId, userId)
  await appendAudit(c.env, c.get('admin').login, 'rating.delete', `${extId}/${userId}`, null)
  return c.json({ ok: true })
})

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

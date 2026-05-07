import type { Env } from '../env'

export interface AuthorRow {
  id: string
  github_login: string
  api_key_hash: string
  banned: number
  created_at: number
}

export interface PublicKeyRow {
  id: string
  author_id: string
  pubkey_b64: string
  name: string | null
  revoked_at: number | null
  created_at: number
}

export interface ExtensionRow {
  id: string
  author_id: string
  display_name: string
  description: string
  category: string
  icon_url: string | null
  homepage_url: string | null
  repo_url: string | null
  latest_version: string
  curated: number
  recommended: number
  download_total: number
  created_at: number
  updated_at: number
}

export interface VersionRow {
  ext_id: string
  version: string
  api_range: string
  size_bytes: number
  sha256: string
  signature_b64: string
  key_id: string
  manifest_json: string
  capabilities: string
  readme_md: string | null
  yanked: number
  published_at: number
}

export interface RatingRow {
  ext_id: string
  user_id: string
  user_login: string
  stars: number
  comment: string | null
  helpful: number
  created_at: number
}

export async function getAuthorById(env: Env, id: string): Promise<AuthorRow | null> {
  const r = await env.DB.prepare('SELECT * FROM authors WHERE id = ?').bind(id).first<AuthorRow>()
  return r ?? null
}

export async function getAuthorByApiKeyHash(
  env: Env,
  hash: string,
): Promise<AuthorRow | null> {
  const r = await env.DB.prepare('SELECT * FROM authors WHERE api_key_hash = ?')
    .bind(hash)
    .first<AuthorRow>()
  return r ?? null
}

export async function getAuthorByLogin(
  env: Env,
  login: string,
): Promise<AuthorRow | null> {
  const r = await env.DB.prepare('SELECT * FROM authors WHERE github_login = ?')
    .bind(login)
    .first<AuthorRow>()
  return r ?? null
}

export async function upsertAuthor(env: Env, row: AuthorRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO authors (id, github_login, api_key_hash, banned, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       github_login = excluded.github_login,
       api_key_hash = excluded.api_key_hash`,
  )
    .bind(row.id, row.github_login, row.api_key_hash, row.banned, row.created_at)
    .run()
}

export async function insertPublicKey(env: Env, row: PublicKeyRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO public_keys (id, author_id, pubkey_b64, name, revoked_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(row.id, row.author_id, row.pubkey_b64, row.name, row.revoked_at, row.created_at)
    .run()
}

export async function getPublicKey(env: Env, keyId: string): Promise<PublicKeyRow | null> {
  const r = await env.DB.prepare('SELECT * FROM public_keys WHERE id = ?')
    .bind(keyId)
    .first<PublicKeyRow>()
  return r ?? null
}

export async function listPublicKeysForAuthor(
  env: Env,
  authorId: string,
): Promise<PublicKeyRow[]> {
  const rs = await env.DB.prepare('SELECT * FROM public_keys WHERE author_id = ?')
    .bind(authorId)
    .all<PublicKeyRow>()
  return rs.results ?? []
}

export async function revokePublicKey(env: Env, keyId: string, when: number): Promise<void> {
  await env.DB.prepare('UPDATE public_keys SET revoked_at = ? WHERE id = ?')
    .bind(when, keyId)
    .run()
}

export async function getExtension(env: Env, id: string): Promise<ExtensionRow | null> {
  const r = await env.DB.prepare('SELECT * FROM extensions WHERE id = ?')
    .bind(id)
    .first<ExtensionRow>()
  return r ?? null
}

export async function upsertExtension(env: Env, row: ExtensionRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO extensions (
       id, author_id, display_name, description, category, icon_url, homepage_url, repo_url,
       latest_version, curated, recommended, download_total, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       description = excluded.description,
       category = excluded.category,
       icon_url = excluded.icon_url,
       homepage_url = excluded.homepage_url,
       repo_url = excluded.repo_url,
       latest_version = excluded.latest_version,
       updated_at = excluded.updated_at`,
  )
    .bind(
      row.id,
      row.author_id,
      row.display_name,
      row.description,
      row.category,
      row.icon_url,
      row.homepage_url,
      row.repo_url,
      row.latest_version,
      row.curated,
      row.recommended,
      row.download_total,
      row.created_at,
      row.updated_at,
    )
    .run()
}

export async function bumpDownloads(
  env: Env,
  extId: string,
  version: string,
  day: string,
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO downloads (ext_id, version, day, count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(ext_id, version, day) DO UPDATE SET count = count + 1`,
    ).bind(extId, version, day),
    env.DB.prepare(
      `UPDATE extensions SET download_total = download_total + 1, updated_at = ? WHERE id = ?`,
    ).bind(Date.now(), extId),
  ])
}

export async function insertVersion(env: Env, row: VersionRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO versions (
       ext_id, version, api_range, size_bytes, sha256, signature_b64, key_id,
       manifest_json, capabilities, readme_md, yanked, published_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.ext_id,
      row.version,
      row.api_range,
      row.size_bytes,
      row.sha256,
      row.signature_b64,
      row.key_id,
      row.manifest_json,
      row.capabilities,
      row.readme_md,
      row.yanked,
      row.published_at,
    )
    .run()
}

export async function getVersion(
  env: Env,
  extId: string,
  version: string,
): Promise<VersionRow | null> {
  const r = await env.DB.prepare(
    'SELECT * FROM versions WHERE ext_id = ? AND version = ?',
  )
    .bind(extId, version)
    .first<VersionRow>()
  return r ?? null
}

export async function listVersionsForExtension(
  env: Env,
  extId: string,
): Promise<VersionRow[]> {
  const rs = await env.DB.prepare(
    'SELECT * FROM versions WHERE ext_id = ? ORDER BY published_at DESC',
  )
    .bind(extId)
    .all<VersionRow>()
  return rs.results ?? []
}

export async function yankVersion(env: Env, extId: string, version: string): Promise<void> {
  await env.DB.prepare('UPDATE versions SET yanked = 1 WHERE ext_id = ? AND version = ?')
    .bind(extId, version)
    .run()
}

export async function yankVersionsByKey(env: Env, keyId: string): Promise<void> {
  await env.DB.prepare('UPDATE versions SET yanked = 1 WHERE key_id = ?').bind(keyId).run()
}

export interface SearchFilter {
  q?: string
  category?: string
  recommended?: boolean
  ids?: string[]
  sort?: 'downloads' | 'stars' | 'recent' | 'name'
  page: number
  pageSize: number
}

export interface ExtensionRowWithStats extends ExtensionRow {
  avg_stars: number
  rating_count: number
  github_login: string
}

export async function searchExtensions(
  env: Env,
  f: SearchFilter,
): Promise<{ items: ExtensionRowWithStats[]; total: number }> {
  const where: string[] = []
  const args: unknown[] = []

  if (f.q && f.q.trim()) {
    where.push('(e.display_name LIKE ? OR e.description LIKE ? OR e.id LIKE ?)')
    const pat = `%${f.q.trim()}%`
    args.push(pat, pat, pat)
  }
  if (f.category) {
    where.push('e.category = ?')
    args.push(f.category)
  }
  if (f.recommended) {
    where.push('e.recommended = 1')
  }
  if (f.ids && f.ids.length) {
    const placeholders = f.ids.map(() => '?').join(',')
    where.push(`e.id IN (${placeholders})`)
    args.push(...f.ids)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  let order = 'e.download_total DESC'
  switch (f.sort) {
    case 'stars':
      order = 's.avg_stars DESC, s.rating_count DESC'
      break
    case 'recent':
      order = 'e.updated_at DESC'
      break
    case 'name':
      order = 'e.display_name ASC'
      break
    case 'downloads':
    default:
      order = 'e.download_total DESC'
  }

  const offset = f.page * f.pageSize
  const sql = `
    SELECT e.*, s.avg_stars AS avg_stars, s.rating_count AS rating_count, a.github_login
    FROM extensions e
    LEFT JOIN v_extension_stats s ON s.ext_id = e.id
    LEFT JOIN authors a ON a.id = e.author_id
    ${whereSql}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `
  const items =
    (await env.DB.prepare(sql).bind(...args, f.pageSize, offset).all<ExtensionRowWithStats>())
      .results ?? []

  const countSql = `SELECT COUNT(*) AS c FROM extensions e ${whereSql}`
  const totalRow = await env.DB.prepare(countSql).bind(...args).first<{ c: number }>()
  return { items, total: totalRow?.c ?? 0 }
}

export async function getExtensionWithStats(
  env: Env,
  id: string,
): Promise<ExtensionRowWithStats | null> {
  const r = await env.DB.prepare(
    `SELECT e.*, s.avg_stars AS avg_stars, s.rating_count AS rating_count, a.github_login
     FROM extensions e
     LEFT JOIN v_extension_stats s ON s.ext_id = e.id
     LEFT JOIN authors a ON a.id = e.author_id
     WHERE e.id = ?`,
  )
    .bind(id)
    .first<ExtensionRowWithStats>()
  return r ?? null
}

export async function listRatings(
  env: Env,
  extId: string,
  page: number,
  pageSize: number,
): Promise<RatingRow[]> {
  const rs = await env.DB.prepare(
    'SELECT * FROM ratings WHERE ext_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
  )
    .bind(extId, pageSize, page * pageSize)
    .all<RatingRow>()
  return rs.results ?? []
}

export async function upsertRating(env: Env, row: RatingRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ratings (ext_id, user_id, user_login, stars, comment, helpful, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ext_id, user_id) DO UPDATE SET
       stars = excluded.stars,
       comment = excluded.comment,
       created_at = excluded.created_at`,
  )
    .bind(row.ext_id, row.user_id, row.user_login, row.stars, row.comment, row.helpful, row.created_at)
    .run()
}

import type { Env } from '../env'
import type { ExtensionRow, AuthorRow } from './queries'

export interface AdminAuditRow {
  id: number
  admin_login: string
  action: string
  target: string | null
  payload_json: string | null
  created_at: number
}

export async function appendAudit(
  env: Env,
  adminLogin: string,
  action: string,
  target: string | null,
  payload: unknown,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO admin_audit (admin_login, action, target, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      adminLogin,
      action,
      target,
      payload != null ? JSON.stringify(payload) : null,
      Date.now(),
    )
    .run()
}

export async function listAudit(
  env: Env,
  page: number,
  pageSize: number,
): Promise<{ items: AdminAuditRow[]; total: number }> {
  const offset = page * pageSize
  const items =
    (await env.DB.prepare(
      'SELECT * FROM admin_audit ORDER BY created_at DESC LIMIT ? OFFSET ?',
    )
      .bind(pageSize, offset)
      .all<AdminAuditRow>()).results ?? []
  const totalRow = await env.DB.prepare('SELECT COUNT(*) AS c FROM admin_audit').first<{
    c: number
  }>()
  return { items, total: totalRow?.c ?? 0 }
}

export interface DashboardMetrics {
  extensionsTotal: number
  versionsTotal: number
  authorsTotal: number
  downloadsLast7d: number
  pendingReports: number
  topExtensions: Array<{
    id: string
    displayName: string
    downloadTotal: number
  }>
  recentVersions: Array<{
    extId: string
    version: string
    publishedAt: number
    sizeBytes: number
  }>
}

export async function getDashboardMetrics(env: Env): Promise<DashboardMetrics> {
  const extTotal = await env.DB.prepare('SELECT COUNT(*) AS c FROM extensions').first<{
    c: number
  }>()
  const verTotal = await env.DB.prepare('SELECT COUNT(*) AS c FROM versions').first<{
    c: number
  }>()
  const authorTotal = await env.DB.prepare('SELECT COUNT(*) AS c FROM authors').first<{
    c: number
  }>()

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const dl = await env.DB.prepare(
    'SELECT COALESCE(SUM(count), 0) AS c FROM downloads WHERE day >= ?',
  )
    .bind(sevenDaysAgo)
    .first<{ c: number }>()

  const top =
    (await env.DB.prepare(
      'SELECT id, display_name, download_total FROM extensions ORDER BY download_total DESC LIMIT 10',
    ).all<{ id: string; display_name: string; download_total: number }>()).results ?? []
  const topExtensions = top.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    downloadTotal: r.download_total,
  }))

  const recent =
    (await env.DB.prepare(
      'SELECT ext_id, version, published_at, size_bytes FROM versions ORDER BY published_at DESC LIMIT 10',
    ).all<{
      ext_id: string
      version: string
      published_at: number
      size_bytes: number
    }>()).results ?? []
  const recentVersions = recent.map((r) => ({
    extId: r.ext_id,
    version: r.version,
    publishedAt: r.published_at,
    sizeBytes: r.size_bytes,
  }))

  return {
    extensionsTotal: extTotal?.c ?? 0,
    versionsTotal: verTotal?.c ?? 0,
    authorsTotal: authorTotal?.c ?? 0,
    downloadsLast7d: dl?.c ?? 0,
    pendingReports: 0,
    topExtensions,
    recentVersions,
  }
}

export interface AdminExtensionRow extends ExtensionRow {
  github_login: string | null
  avg_stars: number
  rating_count: number
  version_count: number
}

export interface AdminListExtensionsFilter {
  q?: string
  category?: string
  curated?: boolean
  recommended?: boolean
  sort?: 'downloads' | 'recent' | 'rating' | 'name'
  page: number
  pageSize: number
}

export async function adminListExtensions(
  env: Env,
  f: AdminListExtensionsFilter,
): Promise<{ items: AdminExtensionRow[]; total: number }> {
  const where: string[] = []
  const args: unknown[] = []
  if (f.q && f.q.trim()) {
    where.push('(e.id LIKE ? OR e.display_name LIKE ?)')
    const pat = `%${f.q.trim()}%`
    args.push(pat, pat)
  }
  if (f.category) {
    where.push('e.category = ?')
    args.push(f.category)
  }
  if (f.curated !== undefined) {
    where.push('e.curated = ?')
    args.push(f.curated ? 1 : 0)
  }
  if (f.recommended !== undefined) {
    where.push('e.recommended = ?')
    args.push(f.recommended ? 1 : 0)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  let order = 'e.download_total DESC'
  switch (f.sort) {
    case 'recent':
      order = 'e.updated_at DESC'
      break
    case 'rating':
      order = 's.avg_stars DESC, s.rating_count DESC'
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
    SELECT e.*, a.github_login,
      COALESCE(s.avg_stars, 0) AS avg_stars,
      COALESCE(s.rating_count, 0) AS rating_count,
      (SELECT COUNT(*) FROM versions v WHERE v.ext_id = e.id) AS version_count
    FROM extensions e
    LEFT JOIN authors a ON a.id = e.author_id
    LEFT JOIN v_extension_stats s ON s.ext_id = e.id
    ${whereSql}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `
  const items =
    (await env.DB.prepare(sql).bind(...args, f.pageSize, offset).all<AdminExtensionRow>())
      .results ?? []
  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM extensions e ${whereSql}`,
  )
    .bind(...args)
    .first<{ c: number }>()
  return { items, total: totalRow?.c ?? 0 }
}

export interface AdminExtensionPatch {
  curated?: boolean
  recommended?: boolean
  category?: string
  displayName?: string
  description?: string
  iconUrl?: string | null
}

export async function adminUpdateExtension(
  env: Env,
  id: string,
  p: AdminExtensionPatch,
): Promise<void> {
  const sets: string[] = []
  const args: unknown[] = []
  if (p.curated !== undefined) {
    sets.push('curated = ?')
    args.push(p.curated ? 1 : 0)
  }
  if (p.recommended !== undefined) {
    sets.push('recommended = ?')
    args.push(p.recommended ? 1 : 0)
  }
  if (p.category !== undefined) {
    sets.push('category = ?')
    args.push(p.category)
  }
  if (p.displayName !== undefined) {
    sets.push('display_name = ?')
    args.push(p.displayName)
  }
  if (p.description !== undefined) {
    sets.push('description = ?')
    args.push(p.description)
  }
  if (p.iconUrl !== undefined) {
    sets.push('icon_url = ?')
    args.push(p.iconUrl)
  }
  if (!sets.length) return
  sets.push('updated_at = ?')
  args.push(Date.now())
  args.push(id)
  await env.DB.prepare(
    `UPDATE extensions SET ${sets.join(', ')} WHERE id = ?`,
  )
    .bind(...args)
    .run()
}

export async function adminDeleteExtension(env: Env, id: string): Promise<string[]> {
  const versions =
    (await env.DB.prepare('SELECT version FROM versions WHERE ext_id = ?')
      .bind(id)
      .all<{ version: string }>()).results ?? []
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ratings WHERE ext_id = ?').bind(id),
    env.DB.prepare('DELETE FROM downloads WHERE ext_id = ?').bind(id),
    env.DB.prepare('DELETE FROM versions WHERE ext_id = ?').bind(id),
    env.DB.prepare('DELETE FROM extensions WHERE id = ?').bind(id),
  ])
  return versions.map((v) => v.version)
}

export async function setVersionYank(
  env: Env,
  extId: string,
  version: string,
  yanked: boolean,
): Promise<void> {
  await env.DB.prepare(
    'UPDATE versions SET yanked = ? WHERE ext_id = ? AND version = ?',
  )
    .bind(yanked ? 1 : 0, extId, version)
    .run()
}

export interface AdminAuthorRow extends AuthorRow {
  extensions_count: number
  total_downloads: number
}

export async function adminListAuthors(
  env: Env,
  q: string | undefined,
  page: number,
  pageSize: number,
): Promise<{ items: AdminAuthorRow[]; total: number }> {
  const where: string[] = []
  const args: unknown[] = []
  if (q && q.trim()) {
    where.push('(a.github_login LIKE ? OR a.id LIKE ?)')
    const pat = `%${q.trim()}%`
    args.push(pat, pat)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const sql = `
    SELECT a.*,
      (SELECT COUNT(*) FROM extensions e WHERE e.author_id = a.id) AS extensions_count,
      (SELECT COALESCE(SUM(e.download_total), 0) FROM extensions e WHERE e.author_id = a.id) AS total_downloads
    FROM authors a
    ${whereSql}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `
  const items =
    (await env.DB.prepare(sql).bind(...args, pageSize, page * pageSize).all<AdminAuthorRow>())
      .results ?? []
  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM authors a ${whereSql}`,
  )
    .bind(...args)
    .first<{ c: number }>()
  return { items, total: totalRow?.c ?? 0 }
}

export async function setAuthorBanned(
  env: Env,
  authorId: string,
  banned: boolean,
): Promise<void> {
  await env.DB.prepare('UPDATE authors SET banned = ? WHERE id = ?')
    .bind(banned ? 1 : 0, authorId)
    .run()
}

export async function rotateAuthorApiKeyHash(
  env: Env,
  authorId: string,
  newHash: string,
): Promise<void> {
  await env.DB.prepare('UPDATE authors SET api_key_hash = ? WHERE id = ?')
    .bind(newHash, authorId)
    .run()
}

export async function revokeAllAuthorPublicKeys(
  env: Env,
  authorId: string,
  when: number,
): Promise<void> {
  await env.DB.prepare(
    'UPDATE public_keys SET revoked_at = ? WHERE author_id = ? AND revoked_at IS NULL',
  )
    .bind(when, authorId)
    .run()
  await env.DB.prepare(
    `UPDATE versions SET yanked = 1 WHERE key_id IN (SELECT id FROM public_keys WHERE author_id = ?)`,
  )
    .bind(authorId)
    .run()
}

export async function setRatingHidden(
  env: Env,
  extId: string,
  userId: string,
): Promise<void> {
  await env.DB.prepare(
    'UPDATE ratings SET helpful = -1 WHERE ext_id = ? AND user_id = ?',
  )
    .bind(extId, userId)
    .run()
}

export async function deleteRating(
  env: Env,
  extId: string,
  userId: string,
): Promise<void> {
  await env.DB.prepare('DELETE FROM ratings WHERE ext_id = ? AND user_id = ?')
    .bind(extId, userId)
    .run()
}

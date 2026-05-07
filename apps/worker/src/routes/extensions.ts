import { Hono } from 'hono'
import type { Env } from '../env'
import {
  getExtensionWithStats,
  listRatings,
  listVersionsForExtension,
  searchExtensions,
} from '../db/queries'
import type {
  Category,
  ExtensionDetail,
  ExtSummary,
  RatingDto,
  SearchResult,
  VersionInfo,
} from '@mterminal/marketplace-types'

export const extensionsRoutes = new Hono<{ Bindings: Env }>()

extensionsRoutes.get('/', async (c) => {
  const url = new URL(c.req.url)
  const q = url.searchParams.get('q') ?? undefined
  const category = url.searchParams.get('category') ?? undefined
  const recommended = url.searchParams.get('recommended') === '1'
  const sort = url.searchParams.get('sort') ?? undefined
  const ids = url.searchParams.get('ids')
  const page = Number(url.searchParams.get('page') ?? '0')
  const pageSize = Math.min(Number(url.searchParams.get('pageSize') ?? '20'), 100)

  const filter = {
    q,
    category,
    recommended,
    ids: ids ? ids.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    sort: (sort as 'downloads' | 'stars' | 'recent' | 'name' | undefined) ?? 'downloads',
    page: Number.isFinite(page) && page >= 0 ? page : 0,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
  }

  const { items, total } = await searchExtensions(c.env, filter)
  const summaries: ExtSummary[] = items.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    description: row.description,
    category: (row.category || 'other') as Category,
    iconUrl: row.icon_url ?? undefined,
    latestVersion: row.latest_version,
    downloadTotal: row.download_total,
    avgStars: row.rating_count > 0 ? row.avg_stars : undefined,
    ratingCount: row.rating_count,
    authorLogin: row.github_login ?? '',
    recommended: !!row.recommended,
    apiRange: '',
  }))

  const result: SearchResult = {
    items: summaries,
    total,
    page: filter.page,
    pageSize: filter.pageSize,
  }
  return c.json(result)
})

extensionsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const row = await getExtensionWithStats(c.env, id)
  if (!row) return c.json({ error: 'not found' }, 404)
  const versions = await listVersionsForExtension(c.env, id)
  const ratings = await listRatings(c.env, id, 0, 20)

  const versionInfos: VersionInfo[] = versions.map((v) => ({
    version: v.version,
    apiRange: v.api_range,
    sizeBytes: v.size_bytes,
    publishedAt: v.published_at,
    yanked: !!v.yanked,
  }))

  const ratingDtos: RatingDto[] = ratings.map((r) => ({
    userId: r.user_id,
    userLogin: r.user_login,
    stars: r.stars,
    comment: r.comment ?? undefined,
    helpful: r.helpful,
    createdAt: r.created_at,
  }))

  let manifest: unknown = null
  let readmeMd: string | undefined
  let apiRange = ''
  if (versions.length) {
    const top = versions[0]!
    try {
      manifest = JSON.parse(top.manifest_json)
    } catch {
      manifest = null
    }
    readmeMd = top.readme_md ?? undefined
    apiRange = top.api_range
  }

  const detail: ExtensionDetail = {
    id: row.id,
    displayName: row.display_name,
    description: row.description,
    category: (row.category || 'other') as Category,
    iconUrl: row.icon_url ?? undefined,
    homepageUrl: row.homepage_url ?? undefined,
    repoUrl: row.repo_url ?? undefined,
    latestVersion: row.latest_version,
    downloadTotal: row.download_total,
    avgStars: row.rating_count > 0 ? row.avg_stars : undefined,
    ratingCount: row.rating_count,
    authorLogin: row.github_login ?? '',
    recommended: !!row.recommended,
    apiRange,
    versions: versionInfos,
    manifest,
    ratings: ratingDtos,
    readmeMd,
  }
  return c.json(detail)
})

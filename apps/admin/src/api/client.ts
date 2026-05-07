export interface AdminMe {
  login: string
  githubUserId: number
  createdAt: number
  csrfToken?: string
}

let csrfToken: string | null = null

export function setCsrfToken(t: string | null): void {
  csrfToken = t
}

export function getCsrfToken(): string | null {
  return csrfToken
}

export interface DashboardMetrics {
  extensionsTotal: number
  versionsTotal: number
  authorsTotal: number
  downloadsLast7d: number
  pendingReports: number
  topExtensions: Array<{ id: string; displayName: string; downloadTotal: number }>
  recentVersions: Array<{
    extId: string
    version: string
    publishedAt: number
    sizeBytes: number
  }>
}

export interface AdminExtensionListItem {
  id: string
  displayName: string
  description: string
  category: string
  iconUrl: string | null
  authorId: string
  authorLogin: string | null
  latestVersion: string
  downloadTotal: number
  curated: boolean
  recommended: boolean
  avgStars: number | null
  ratingCount: number
  versionCount: number
  updatedAt: number
}

export interface AdminExtensionListResponse {
  items: AdminExtensionListItem[]
  total: number
  page: number
  pageSize: number
}

export interface AdminVersionRow {
  version: string
  apiRange: string
  sizeBytes: number
  sha256: string
  keyId: string
  yanked: boolean
  publishedAt: number
}

export interface AdminRatingRow {
  userId: string
  userLogin: string
  stars: number
  comment: string | null
  helpful: number
  hidden: boolean
  createdAt: number
}

export interface AdminExtensionDetail extends AdminExtensionListItem {
  homepageUrl: string | null
  repoUrl: string | null
  createdAt: number
  versions: AdminVersionRow[]
  ratings: AdminRatingRow[]
}

export interface AdminAuthorRow {
  id: string
  githubLogin: string
  banned: boolean
  createdAt: number
  extensionsCount: number
  totalDownloads: number
}

export interface AdminAuthorsResponse {
  items: AdminAuthorRow[]
  total: number
  page: number
  pageSize: number
}

export interface AdminAuditEntry {
  id: number
  adminLogin: string
  action: string
  target: string | null
  payload: unknown
  createdAt: number
}

export interface AdminAuditResponse {
  items: AdminAuditEntry[]
  total: number
  page: number
  pageSize: number
}

export interface AdminExtensionPatch {
  curated?: boolean
  recommended?: boolean
  category?: string
  displayName?: string
  description?: string
  iconUrl?: string | null
}

const BASE = '/v1/admin'

class ApiError extends Error {
  status: number
  constructor(status: number, msg: string) {
    super(msg)
    this.status = status
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers)
  let body: BodyInit | undefined = init?.body ?? undefined
  if (init?.json !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(init.json)
  }
  const method = (init?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    if (csrfToken && !headers.has('x-csrf-token')) {
      headers.set('x-csrf-token', csrfToken)
    }
  }
  const r = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers,
    body,
  })
  if (r.status === 401) {
    throw new ApiError(401, 'unauthorized')
  }
  if (!r.ok) {
    let msg = `HTTP ${r.status}`
    try {
      const j = (await r.json()) as { error?: string }
      if (j?.error) msg = j.error
    } catch {}
    throw new ApiError(r.status, msg)
  }
  if (r.status === 204) return undefined as T
  return (await r.json()) as T
}

export const api = {
  me: () => request<AdminMe>('/me'),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  devLogin: (login: string) =>
    request<{ ok: boolean; login: string }>('/auth/dev-login', {
      method: 'POST',
      json: { login },
    }),

  dashboard: () => request<DashboardMetrics>('/dashboard'),

  listExtensions: (qs: URLSearchParams) =>
    request<AdminExtensionListResponse>(`/extensions?${qs.toString()}`),
  getExtension: (id: string) =>
    request<AdminExtensionDetail>(`/extensions/${encodeURIComponent(id)}`),
  patchExtension: (id: string, patch: AdminExtensionPatch) =>
    request<{ ok: true }>(`/extensions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      json: patch,
    }),
  deleteExtension: (id: string) =>
    request<{ ok: true; deletedVersions: string[] }>(
      `/extensions/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),
  yankVersion: (id: string, version: string, reason: string) =>
    request<{ ok: true }>(
      `/extensions/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/yank`,
      { method: 'POST', json: { reason } },
    ),
  unyankVersion: (id: string, version: string) =>
    request<{ ok: true }>(
      `/extensions/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/unyank`,
      { method: 'POST' },
    ),

  listAuthors: (qs: URLSearchParams) =>
    request<AdminAuthorsResponse>(`/authors?${qs.toString()}`),
  banAuthor: (id: string) =>
    request<{ ok: true }>(`/authors/${encodeURIComponent(id)}/ban`, {
      method: 'POST',
    }),
  unbanAuthor: (id: string) =>
    request<{ ok: true }>(`/authors/${encodeURIComponent(id)}/unban`, {
      method: 'POST',
    }),
  revokeAuthorApiKey: (id: string) =>
    request<{ ok: true }>(`/authors/${encodeURIComponent(id)}/revoke-api-key`, {
      method: 'POST',
    }),
  revokeAllAuthorKeys: (id: string) =>
    request<{ ok: true }>(`/authors/${encodeURIComponent(id)}/revoke-all-keys`, {
      method: 'POST',
    }),

  listAudit: (qs: URLSearchParams) =>
    request<AdminAuditResponse>(`/audit?${qs.toString()}`),

  hideRating: (extId: string, userId: string) =>
    request<{ ok: true }>(
      `/ratings/${encodeURIComponent(extId)}/${encodeURIComponent(userId)}/hide`,
      { method: 'POST' },
    ),
  deleteRating: (extId: string, userId: string) =>
    request<{ ok: true }>(
      `/ratings/${encodeURIComponent(extId)}/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
    ),
}

export { ApiError }

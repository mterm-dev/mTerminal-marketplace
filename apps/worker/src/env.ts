export interface Env {
  DB: D1Database
  PACKAGES: R2Bucket
  SESSIONS: KVNamespace
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET?: string
  PUBLIC_R2_BASE: string
  SIGNED_URL_TTL_SEC: string
  JWT_SECRET?: string
  ADMIN_LOGINS: string
  ADMIN_GITHUB_CLIENT_ID: string
  ADMIN_GITHUB_CLIENT_SECRET?: string
  ADMIN_BASE_URL?: string
  ADMIN_DEV_LOGIN?: string
  ASSETS?: Fetcher
}

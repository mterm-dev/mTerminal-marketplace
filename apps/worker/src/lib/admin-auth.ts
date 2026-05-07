import type { Env } from '../env'

export interface AdminSession {
  login: string
  githubUserId: number
  createdAt: number
  csrfToken: string
}

const SESSION_TTL_SEC = 7 * 24 * 60 * 60
const COOKIE_NAME = 'admin_session'

export function adminAllowlist(env: Env): string[] {
  return (env.ADMIN_LOGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function isAdminLogin(env: Env, login: string): boolean {
  const list = adminAllowlist(env)
  if (!list.length) return false
  return list.includes(login)
}

export function isDevLoginEnabled(env: Env): boolean {
  return env.ADMIN_DEV_LOGIN === '1'
}

export function newSessionToken(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!)
  return 'admin_' + btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function newOAuthState(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!)
  return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function newCsrfToken(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  let h = ''
  for (let i = 0; i < b.length; i++) h += b[i]!.toString(16).padStart(2, '0')
  return h
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const k = part.slice(0, eq).trim()
    const v = part.slice(eq + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

export function buildSessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SEC}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function buildClearSessionCookie(secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function buildOAuthStateCookie(state: string, secure: boolean): string {
  const parts = [
    `admin_oauth_state=${state}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=600',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export async function readAdminSession(
  env: Env,
  token: string,
): Promise<AdminSession | null> {
  const raw = await env.SESSIONS.get(`admin:${token}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AdminSession
  } catch {
    return null
  }
}

export async function writeAdminSession(
  env: Env,
  token: string,
  session: AdminSession,
): Promise<void> {
  await env.SESSIONS.put(`admin:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SEC,
  })
}

export async function deleteAdminSession(env: Env, token: string): Promise<void> {
  await env.SESSIONS.delete(`admin:${token}`)
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME
export const ADMIN_SESSION_TTL_SEC = SESSION_TTL_SEC

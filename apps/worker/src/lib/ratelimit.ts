import type { Env } from '../env'

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
}

export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000)
  const windowStart = Math.floor(now / windowSec) * windowSec
  const resetAt = windowStart + windowSec
  const kvKey = `rl:${key}:${windowStart}`
  const raw = await env.SESSIONS.get(kvKey)
  const current = raw ? Number(raw) : 0
  if (current >= limit) {
    return { ok: false, remaining: 0, resetAt }
  }
  const next = current + 1
  const ttl = Math.max(60, resetAt - now + 60)
  await env.SESSIONS.put(kvKey, String(next), { expirationTtl: ttl })
  return { ok: true, remaining: Math.max(0, limit - next), resetAt }
}

export function clientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

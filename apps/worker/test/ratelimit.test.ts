import { describe, expect, it } from 'vitest'
import { SELF, env } from 'cloudflare:test'
import { rateLimit } from '../src/lib/ratelimit'

describe('rateLimit lib', () => {
  it('allows up to limit then 429s', async () => {
    const key = `t-${Math.random().toString(36).slice(2)}`
    let last
    for (let i = 0; i < 3; i++) {
      last = await rateLimit(env, key, 3, 60)
      expect(last.ok).toBe(true)
    }
    const blocked = await rateLimit(env, key, 3, 60)
    expect(blocked.ok).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('uses separate counters per key', async () => {
    const a = `a-${Math.random()}`
    const b = `b-${Math.random()}`
    await rateLimit(env, a, 1, 60)
    const r = await rateLimit(env, b, 1, 60)
    expect(r.ok).toBe(true)
  })
})

describe('device-flow rate limiting', () => {
  it('returns 429 after 10 device/start calls from same IP', async () => {
    const ip = `9.9.9.${Math.floor(Math.random() * 250)}`
    let last: Response | undefined
    for (let i = 0; i < 11; i++) {
      last = await SELF.fetch('http://test.local/v1/auth/device/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
        body: '{}',
      })
    }
    expect(last!.status).toBe(429)
    expect(last!.headers.get('Retry-After')).toBeDefined()
  })

  it('rate limits admin dev-login per IP', async () => {
    const ip = `8.8.8.${Math.floor(Math.random() * 250)}`
    let last: Response | undefined
    for (let i = 0; i < 21; i++) {
      last = await SELF.fetch('http://test.local/v1/admin/auth/dev-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
        body: JSON.stringify({ login: 'admin-tester' }),
      })
    }
    expect(last!.status).toBe(429)
  })
})

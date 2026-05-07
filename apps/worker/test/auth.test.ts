import { describe, expect, it } from 'vitest'
import { SELF } from 'cloudflare:test'

describe('device flow', () => {
  it('start returns a deviceCode + userCode', async () => {
    const r = await SELF.fetch('http://test.local/v1/auth/device/start', { method: 'POST' })
    expect(r.status).toBe(200)
    const j = (await r.json()) as { deviceCode: string; userCode: string; expiresIn: number }
    expect(j.deviceCode.length).toBeGreaterThan(8)
    expect(j.userCode.length).toBeGreaterThan(0)
    expect(j.expiresIn).toBeGreaterThan(0)
  })

  it('poll on unknown device returns expired', async () => {
    const r = await SELF.fetch('http://test.local/v1/auth/device/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceCode: 'unknown-device' }),
    })
    expect(r.status).toBe(200)
    const j = (await r.json()) as { status: string }
    expect(j.status).toBe('expired')
  })

  it('dev-authorize then poll completes the flow with an apiKey', async () => {
    const start = await SELF.fetch('http://test.local/v1/auth/device/start', { method: 'POST' })
    const startJson = (await start.json()) as { deviceCode: string }

    const dev = await SELF.fetch('http://test.local/v1/auth/device/dev-authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceCode: startJson.deviceCode, githubLogin: 'devuser' }),
    })
    expect(dev.status).toBe(200)

    const poll = await SELF.fetch('http://test.local/v1/auth/device/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceCode: startJson.deviceCode }),
    })
    expect(poll.status).toBe(200)
    const pollJson = (await poll.json()) as {
      status: string
      apiKey?: string
      authorId?: string
      githubLogin?: string
    }
    expect(pollJson.status).toBe('authorized')
    expect(pollJson.apiKey).toMatch(/^mtx_/)
    expect(pollJson.authorId).toMatch(/^gh-/)
    expect(pollJson.githubLogin).toBe('devuser')
  })
})

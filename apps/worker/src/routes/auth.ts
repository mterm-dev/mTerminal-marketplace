import { Hono } from 'hono'
import type { Env } from '../env'
import { generateApiKey, hashApiKey } from '../lib/jwt'
import { upsertAuthor } from '../db/queries'
import type {
  DeviceFlowPollResult,
  DeviceFlowStartResult,
} from '@mterminal/marketplace-types'

export const authRoutes = new Hono<{ Bindings: Env }>()

interface DeviceState {
  deviceCode: string
  userCode: string
  status: 'pending' | 'authorized' | 'expired' | 'denied'
  apiKey?: string
  authorId?: string
  githubLogin?: string
  expiresAt: number
  ghDeviceCode?: string
}

function randomCode(len: number): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < len; i++) out += alpha[bytes[i]! % alpha.length]
  return out
}

authRoutes.post('/device/start', async (c) => {
  const deviceCode = crypto.randomUUID()
  const userCode = `${randomCode(4)}-${randomCode(4)}`
  const ttlSec = 600
  const state: DeviceState = {
    deviceCode,
    userCode,
    status: 'pending',
    expiresAt: Date.now() + ttlSec * 1000,
  }

  let verificationUri = `https://github.com/login/device`
  if (c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_ID !== 'replace-me' && c.env.GITHUB_CLIENT_SECRET) {
    try {
      const r = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: c.env.GITHUB_CLIENT_ID, scope: 'read:user' }),
      })
      if (r.ok) {
        const j = (await r.json()) as {
          device_code: string
          user_code: string
          verification_uri: string
          expires_in: number
          interval: number
        }
        state.ghDeviceCode = j.device_code
        state.userCode = j.user_code
        verificationUri = j.verification_uri
      }
    } catch {}
  }

  await c.env.SESSIONS.put(`device:${deviceCode}`, JSON.stringify(state), {
    expirationTtl: ttlSec,
  })

  const result: DeviceFlowStartResult = {
    deviceCode,
    userCode: state.userCode,
    verificationUri,
    expiresIn: ttlSec,
    interval: 5,
  }
  return c.json(result)
})

authRoutes.post('/device/poll', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { deviceCode?: string } | null
  if (!body?.deviceCode) return c.json({ error: 'deviceCode required' }, 400)
  const raw = await c.env.SESSIONS.get(`device:${body.deviceCode}`)
  if (!raw) return c.json({ status: 'expired' } satisfies DeviceFlowPollResult)
  const state = JSON.parse(raw) as DeviceState
  if (Date.now() > state.expiresAt) {
    return c.json({ status: 'expired' } satisfies DeviceFlowPollResult)
  }

  if (state.status === 'pending' && state.ghDeviceCode && c.env.GITHUB_CLIENT_SECRET) {
    try {
      const r = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: c.env.GITHUB_CLIENT_ID,
          device_code: state.ghDeviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      })
      const j = (await r.json()) as {
        access_token?: string
        error?: string
      }
      if (j.access_token) {
        const u = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${j.access_token}`,
            'User-Agent': 'mterminal-marketplace',
            Accept: 'application/vnd.github+json',
          },
        })
        if (u.ok) {
          const user = (await u.json()) as { id: number; login: string }
          const apiKey = generateApiKey()
          state.apiKey = apiKey
          state.authorId = `gh-${user.id}`
          state.githubLogin = user.login
          state.status = 'authorized'
          await upsertAuthor(c.env, {
            id: state.authorId,
            github_login: user.login,
            api_key_hash: hashApiKey(apiKey),
            banned: 0,
            created_at: Date.now(),
          })
          await c.env.SESSIONS.put(`device:${body.deviceCode}`, JSON.stringify(state), {
            expirationTtl: 600,
          })
        }
      }
    } catch {}
  }

  const result: DeviceFlowPollResult = {
    status: state.status,
    apiKey: state.apiKey,
    authorId: state.authorId,
    githubLogin: state.githubLogin,
  }
  return c.json(result)
})

authRoutes.post('/device/dev-authorize', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { deviceCode?: string; githubLogin?: string }
    | null
  if (!body?.deviceCode || !body?.githubLogin)
    return c.json({ error: 'deviceCode + githubLogin required' }, 400)
  const raw = await c.env.SESSIONS.get(`device:${body.deviceCode}`)
  if (!raw) return c.json({ error: 'unknown device' }, 404)
  const state = JSON.parse(raw) as DeviceState
  const fakeUserId = Math.abs(
    [...body.githubLogin].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7),
  )
  const apiKey = generateApiKey()
  state.apiKey = apiKey
  state.authorId = `gh-${fakeUserId}`
  state.githubLogin = body.githubLogin
  state.status = 'authorized'
  await upsertAuthor(c.env, {
    id: state.authorId,
    github_login: body.githubLogin,
    api_key_hash: hashApiKey(apiKey),
    banned: 0,
    created_at: Date.now(),
  })
  await c.env.SESSIONS.put(`device:${body.deviceCode}`, JSON.stringify(state), {
    expirationTtl: 600,
  })
  return c.json({ ok: true })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deviceStart,
  devicePoll,
  devAuthorize,
  registerKey,
  publishPackage,
  yankVersion,
  search,
} from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): void {
  const fn = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input)
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fn)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('api', () => {
  it('deviceStart hits /v1/auth/device/start', async () => {
    stubFetch((url) => {
      expect(url).toBe('https://api.example.com/v1/auth/device/start')
      return jsonResponse({
        deviceCode: 'd',
        userCode: 'u',
        verificationUri: 'https://x',
        expiresIn: 300,
        interval: 5,
      })
    })
    const r = await deviceStart({ endpoint: 'https://api.example.com' })
    expect(r.deviceCode).toBe('d')
  })

  it('devicePoll posts deviceCode body', async () => {
    stubFetch((url, init) => {
      expect(url).toBe('https://api.example.com/v1/auth/device/poll')
      expect(JSON.parse(String(init?.body))).toEqual({ deviceCode: 'd' })
      return jsonResponse({ status: 'authorized', apiKey: 'mtx_x', authorId: 'gh-1' })
    })
    const r = await devicePoll({ endpoint: 'https://api.example.com' }, 'd')
    expect(r.apiKey).toBe('mtx_x')
  })

  it('devAuthorize sends deviceCode + githubLogin', async () => {
    stubFetch((url, init) => {
      expect(url).toBe('https://api.example.com/v1/auth/device/dev-authorize')
      expect(JSON.parse(String(init?.body))).toEqual({
        deviceCode: 'd',
        githubLogin: 'me',
      })
      return jsonResponse({ ok: true })
    })
    await devAuthorize({ endpoint: 'https://api.example.com' }, 'd', 'me')
  })

  it('registerKey requires apiKey and posts pubkey', async () => {
    await expect(
      registerKey({ endpoint: 'https://x' }, { pubkeyB64: 'aaa' }),
    ).rejects.toThrow(/apiKey/)
    stubFetch((_, init) => {
      const auth = (init?.headers as Record<string, string>).authorization
      expect(auth).toBe('Bearer mtx_xx')
      return jsonResponse({ keyId: 'gh-1:key1' })
    })
    const r = await registerKey(
      { endpoint: 'https://x', apiKey: 'mtx_xx' },
      { pubkeyB64: 'aaa' },
    )
    expect(r.keyId).toBe('gh-1:key1')
  })

  it('publishPackage uploads multipart and returns PublishResult', async () => {
    stubFetch(async (url, init) => {
      expect(url).toBe('https://x/v1/publish')
      expect(init?.body).toBeInstanceOf(FormData)
      return jsonResponse({ ok: true, id: 'demo', version: '1.0.0' })
    })
    const r = await publishPackage(
      { endpoint: 'https://x', apiKey: 'mtx_yy' },
      new Uint8Array([1, 2, 3]),
    )
    expect(r.ok).toBe(true)
    expect(r.id).toBe('demo')
  })

  it('publishPackage returns policy errors as-is', async () => {
    stubFetch(() =>
      jsonResponse(
        { ok: false, errors: [{ code: 'manifest', issues: [{ message: 'bad' }] }] },
        400,
      ),
    )
    const r = await publishPackage(
      { endpoint: 'https://x', apiKey: 'mtx_yy' },
      new Uint8Array([1]),
    )
    expect(r.ok).toBe(false)
    expect(r.errors?.[0]?.code).toBe('manifest')
  })

  it('yankVersion calls the right path', async () => {
    stubFetch((url) => {
      expect(url).toBe('https://x/v1/extensions/foo/yank/1.0.0')
      return jsonResponse({ ok: true })
    })
    await yankVersion({ endpoint: 'https://x', apiKey: 'mtx_z' }, 'foo', '1.0.0')
  })

  it('search appends query params', async () => {
    stubFetch((url) => {
      expect(url).toBe('https://x/v1/extensions?q=foo&category=ai')
      return jsonResponse({ items: [], total: 0, page: 0, pageSize: 20 })
    })
    await search({ endpoint: 'https://x' }, { q: 'foo', category: 'ai' })
  })

  it('throws on non-2xx with error field', async () => {
    stubFetch(() => jsonResponse({ error: 'not found' }, 404))
    await expect(
      search({ endpoint: 'https://x' }, { q: 'foo' }),
    ).rejects.toThrow(/HTTP 404/)
  })
})

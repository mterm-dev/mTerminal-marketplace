import type {
  DeviceFlowPollResult,
  DeviceFlowStartResult,
  KeyRegisterRequest,
  KeyRegisterResponse,
  PublishResult,
  SearchResult,
} from '@mterminal/marketplace-types'

export interface ApiOptions {
  endpoint: string
  apiKey?: string
}

async function expectJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`expected json response, got: ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    const body = json as { error?: string; errors?: unknown }
    throw new Error(`HTTP ${res.status}: ${body.error ?? JSON.stringify(json)}`)
  }
  return json as T
}

export async function deviceStart(opts: ApiOptions): Promise<DeviceFlowStartResult> {
  const r = await fetch(`${opts.endpoint}/v1/auth/device/start`, { method: 'POST' })
  return expectJson<DeviceFlowStartResult>(r)
}

export async function devicePoll(
  opts: ApiOptions,
  deviceCode: string,
): Promise<DeviceFlowPollResult> {
  const r = await fetch(`${opts.endpoint}/v1/auth/device/poll`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceCode }),
  })
  return expectJson<DeviceFlowPollResult>(r)
}

export async function devAuthorize(
  opts: ApiOptions,
  deviceCode: string,
  githubLogin: string,
): Promise<void> {
  const r = await fetch(`${opts.endpoint}/v1/auth/device/dev-authorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceCode, githubLogin }),
  })
  await expectJson<{ ok: boolean }>(r)
}

export async function registerKey(
  opts: ApiOptions,
  body: KeyRegisterRequest,
): Promise<KeyRegisterResponse> {
  if (!opts.apiKey) throw new Error('apiKey required')
  const r = await fetch(`${opts.endpoint}/v1/keys`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  return expectJson<KeyRegisterResponse>(r)
}

export async function publishPackage(
  opts: ApiOptions,
  data: Uint8Array,
): Promise<PublishResult> {
  if (!opts.apiKey) throw new Error('apiKey required')
  const fd = new FormData()
  fd.append('package', new Blob([data], { type: 'application/zip' }), 'package.mtx')
  const r = await fetch(`${opts.endpoint}/v1/publish`, {
    method: 'POST',
    headers: { authorization: `Bearer ${opts.apiKey}` },
    body: fd,
  })
  const text = await r.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`unexpected response: ${text.slice(0, 200)}`)
  }
  return json as PublishResult
}

export async function yankVersion(
  opts: ApiOptions,
  id: string,
  version: string,
): Promise<void> {
  if (!opts.apiKey) throw new Error('apiKey required')
  const r = await fetch(`${opts.endpoint}/v1/extensions/${id}/yank/${version}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${opts.apiKey}` },
  })
  await expectJson<{ ok: boolean }>(r)
}

export async function search(
  opts: ApiOptions,
  query: Record<string, string>,
): Promise<SearchResult> {
  const qs = new URLSearchParams(query).toString()
  const r = await fetch(`${opts.endpoint}/v1/extensions?${qs}`)
  return expectJson<SearchResult>(r)
}

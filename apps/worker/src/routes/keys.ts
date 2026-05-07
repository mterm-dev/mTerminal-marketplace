import { Hono } from 'hono'
import type { Env } from '../env'
import {
  getAuthorByApiKeyHash,
  getPublicKey,
  insertPublicKey,
  listPublicKeysForAuthor,
  revokePublicKey,
  yankVersionsByKey,
} from '../db/queries'
import { bearerFromHeader, hashApiKey } from '../lib/jwt'
import { isValidPubkeyB64, b64ToBytes } from '../lib/ed25519'
import { putPubkey } from '../lib/r2'
import type { KeyInfo, KeyRegisterRequest, KeyRegisterResponse } from '@mterminal/marketplace-types'

export const keysRoutes = new Hono<{ Bindings: Env }>()

keysRoutes.post('/', async (c) => {
  const apiKey = bearerFromHeader(c.req.header('Authorization') ?? null)
  if (!apiKey) return c.json({ error: 'unauthorized' }, 401)
  const author = await getAuthorByApiKeyHash(c.env, hashApiKey(apiKey))
  if (!author) return c.json({ error: 'unauthorized' }, 401)
  if (author.banned) return c.json({ error: 'banned' }, 403)

  const body = (await c.req.json().catch(() => null)) as KeyRegisterRequest | null
  if (!body || typeof body.pubkeyB64 !== 'string' || !isValidPubkeyB64(body.pubkeyB64)) {
    return c.json({ error: 'pubkeyB64 invalid' }, 400)
  }

  const existing = await listPublicKeysForAuthor(c.env, author.id)
  const idx = existing.length + 1
  const keyId = `${author.id}:key${idx}`
  const now = Date.now()
  await insertPublicKey(c.env, {
    id: keyId,
    author_id: author.id,
    pubkey_b64: body.pubkeyB64,
    name: body.name ?? null,
    revoked_at: null,
    created_at: now,
  })
  await putPubkey(c.env, keyId, b64ToBytes(body.pubkeyB64))
  const res: KeyRegisterResponse = { keyId }
  return c.json(res)
})

keysRoutes.post('/:keyId/revoke', async (c) => {
  const apiKey = bearerFromHeader(c.req.header('Authorization') ?? null)
  if (!apiKey) return c.json({ error: 'unauthorized' }, 401)
  const author = await getAuthorByApiKeyHash(c.env, hashApiKey(apiKey))
  if (!author) return c.json({ error: 'unauthorized' }, 401)

  const keyId = c.req.param('keyId')
  const key = await getPublicKey(c.env, keyId)
  if (!key) return c.json({ error: 'key not found' }, 404)
  if (key.author_id !== author.id) return c.json({ error: 'forbidden' }, 403)

  const now = Date.now()
  await revokePublicKey(c.env, keyId, now)
  await yankVersionsByKey(c.env, keyId)
  return c.json({ ok: true })
})

keysRoutes.get('/:keyId', async (c) => {
  const keyId = c.req.param('keyId')
  const key = await getPublicKey(c.env, keyId)
  if (!key) return c.json({ error: 'key not found' }, 404)
  const info: KeyInfo = {
    keyId: key.id,
    authorId: key.author_id,
    pubkeyB64: key.pubkey_b64,
    revokedAt: key.revoked_at,
    createdAt: key.created_at,
  }
  return c.json(info)
})

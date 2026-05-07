import { Hono } from 'hono'
import type { Env } from '../env'
import { bearerFromHeader, hashApiKey } from '../lib/jwt'
import { getAuthorByApiKeyHash, getExtension, getVersion, yankVersion } from '../db/queries'

export const yankRoutes = new Hono<{ Bindings: Env }>()

yankRoutes.post('/:id/yank/:ver', async (c) => {
  const apiKey = bearerFromHeader(c.req.header('Authorization') ?? null)
  if (!apiKey) return c.json({ error: 'unauthorized' }, 401)
  const author = await getAuthorByApiKeyHash(c.env, hashApiKey(apiKey))
  if (!author) return c.json({ error: 'unauthorized' }, 401)

  const id = c.req.param('id')
  const ver = c.req.param('ver')
  const ext = await getExtension(c.env, id)
  if (!ext) return c.json({ error: 'not found' }, 404)
  if (ext.author_id !== author.id) return c.json({ error: 'forbidden' }, 403)
  const v = await getVersion(c.env, id, ver)
  if (!v) return c.json({ error: 'version not found' }, 404)
  await yankVersion(c.env, id, ver)
  return c.json({ ok: true })
})

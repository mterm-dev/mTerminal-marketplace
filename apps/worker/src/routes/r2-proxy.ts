import { Hono } from 'hono'
import type { Env } from '../env'

export const r2ProxyRoutes = new Hono<{ Bindings: Env }>()

r2ProxyRoutes.get('/:rest{.+}', async (c) => {
  const key = c.req.param('rest')
  const obj = await c.env.PACKAGES.get(key)
  if (!obj) return c.json({ error: 'not found' }, 404)
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  return new Response(obj.body, { headers })
})

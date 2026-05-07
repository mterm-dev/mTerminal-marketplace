import { Hono } from 'hono'
import type { Env } from './env'
import { extensionsRoutes } from './routes/extensions'
import { downloadRoutes } from './routes/download'
import { publishRoutes } from './routes/publish'
import { keysRoutes } from './routes/keys'
import { extensionRatingsRoutes, ratingsRoutes } from './routes/ratings'
import { authRoutes } from './routes/auth'
import { yankRoutes } from './routes/yank'
import { r2ProxyRoutes } from './routes/r2-proxy'
import { adminRoutes } from './routes/admin'
import { runR2Cleanup } from './lib/r2-cleanup'

const app = new Hono<{ Bindings: Env }>()

app.get('/', (c) =>
  c.json({ name: 'mterminal-marketplace', version: '0.1.0', status: 'ok' }),
)

app.get('/healthz', (c) => c.json({ ok: true }))

app.route('/v1/extensions', extensionsRoutes)
app.route('/v1/extensions', downloadRoutes)
app.route('/v1/extensions', extensionRatingsRoutes)
app.route('/v1/extensions', yankRoutes)
app.route('/v1/publish', publishRoutes)
app.route('/v1/keys', keysRoutes)
app.route('/v1/ratings', ratingsRoutes)
app.route('/v1/auth', authRoutes)
app.route('/v1/admin', adminRoutes)
app.route('/r2', r2ProxyRoutes)

app.get('/admin', (c) => c.redirect('/admin/', 302))

app.all('/admin/*', async (c) => {
  if (!c.env.ASSETS) {
    return c.html(
      `<!doctype html><meta charset="utf-8"><title>mterminal admin</title><body><p>admin assets not configured. build apps/admin and bind ASSETS to its dist/.</p></body>`,
      503,
    )
  }
  const url = new URL(c.req.url)
  const path = url.pathname.replace(/^\/admin\/?/, '')
  const assetUrl = new URL(`/${path}`, url.origin)
  let res = await c.env.ASSETS.fetch(new Request(assetUrl.toString(), c.req.raw))
  if (res.status === 404) {
    const indexUrl = new URL('/index.html', url.origin)
    res = await c.env.ASSETS.fetch(new Request(indexUrl.toString(), c.req.raw))
  }
  return res
})

app.onError((err, c) => {
  console.error('worker error:', err)
  return c.json({ error: 'internal', message: String(err) }, 500)
})

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runR2Cleanup(env))
  },
}

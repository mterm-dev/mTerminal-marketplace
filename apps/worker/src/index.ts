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
app.route('/r2', r2ProxyRoutes)

app.onError((err, c) => {
  console.error('worker error:', err)
  return c.json({ error: 'internal', message: String(err) }, 500)
})

export default app

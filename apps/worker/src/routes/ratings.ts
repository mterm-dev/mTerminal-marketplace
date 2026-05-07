import { Hono } from 'hono'
import type { Env } from '../env'
import { listRatings, upsertRating, getExtension } from '../db/queries'
import { bearerFromHeader } from '../lib/jwt'
import type { RatingDto, RatingSubmitRequest } from '@mterminal/marketplace-types'

export const ratingsRoutes = new Hono<{ Bindings: Env }>()

interface SessionRow {
  userId: string
  userLogin: string
}

async function readSession(env: Env, token: string): Promise<SessionRow | null> {
  const raw = await env.SESSIONS.get(`session:${token}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionRow
  } catch {
    return null
  }
}

ratingsRoutes.post('/', async (c) => {
  const token = bearerFromHeader(c.req.header('Authorization') ?? null)
  if (!token) return c.json({ error: 'unauthorized' }, 401)
  const session = await readSession(c.env, token)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = (await c.req.json().catch(() => null)) as RatingSubmitRequest | null
  if (!body || typeof body.extensionId !== 'string' || typeof body.stars !== 'number') {
    return c.json({ error: 'invalid body' }, 400)
  }
  const stars = Math.round(body.stars)
  if (stars < 1 || stars > 5) return c.json({ error: 'stars must be 1..5' }, 400)
  const ext = await getExtension(c.env, body.extensionId)
  if (!ext) return c.json({ error: 'extension not found' }, 404)
  await upsertRating(c.env, {
    ext_id: body.extensionId,
    user_id: session.userId,
    user_login: session.userLogin,
    stars,
    comment: body.comment ?? null,
    helpful: 0,
    created_at: Date.now(),
  })
  return c.json({ ok: true })
})

export const extensionRatingsRoutes = new Hono<{ Bindings: Env }>()

extensionRatingsRoutes.get('/:id/ratings', async (c) => {
  const id = c.req.param('id')
  const url = new URL(c.req.url)
  const page = Number(url.searchParams.get('page') ?? '0')
  const pageSize = Math.min(Number(url.searchParams.get('pageSize') ?? '20'), 100)
  const rows = await listRatings(
    c.env,
    id,
    Number.isFinite(page) && page >= 0 ? page : 0,
    Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
  )
  const items: RatingDto[] = rows.map((r) => ({
    userId: r.user_id,
    userLogin: r.user_login,
    stars: r.stars,
    comment: r.comment ?? undefined,
    helpful: r.helpful,
    createdAt: r.created_at,
  }))
  return c.json({ items })
})

import { Hono } from 'hono'
import type { Env } from '../env'
import { bumpDownloads, getVersion } from '../db/queries'
import { packageDownloadUrl } from '../lib/r2'
import type { DownloadInfo } from '@mterminal/marketplace-types'

export const downloadRoutes = new Hono<{ Bindings: Env }>()

function todayUtc(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

downloadRoutes.get('/:id/versions/:ver/download', async (c) => {
  const id = c.req.param('id')
  const ver = c.req.param('ver')
  const row = await getVersion(c.env, id, ver)
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.yanked) return c.json({ error: 'version yanked' }, 410)

  await bumpDownloads(c.env, id, ver, todayUtc())

  const accept = c.req.header('Accept') ?? ''
  const url = packageDownloadUrl(c.env, id, ver)
  if (accept.includes('application/json')) {
    const info: DownloadInfo = {
      url,
      sha256: row.sha256,
      signatureB64: row.signature_b64,
      keyId: row.key_id,
      authorId: '',
      sizeBytes: row.size_bytes,
    }
    return c.json(info)
  }
  return c.redirect(url, 302)
})

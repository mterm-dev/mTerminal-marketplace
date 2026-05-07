import type { Env } from '../env'

export async function schedulePackageDeletion(
  env: Env,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return
  const now = Date.now()
  const stmts = keys.map((k) =>
    env.DB.prepare(
      `INSERT INTO pending_r2_cleanup (key, created_at, retries) VALUES (?, ?, 0)
       ON CONFLICT(key) DO UPDATE SET retries = 0, created_at = excluded.created_at`,
    ).bind(k, now),
  )
  await env.DB.batch(stmts)
}

export interface CleanupRow {
  key: string
  created_at: number
  retries: number
}

export async function runR2Cleanup(env: Env, maxBatch = 100): Promise<{
  attempted: number
  deleted: number
  failed: number
}> {
  const res = await env.DB.prepare(
    `SELECT key, created_at, retries FROM pending_r2_cleanup WHERE retries < 5 ORDER BY created_at ASC LIMIT ?`,
  )
    .bind(maxBatch)
    .all<CleanupRow>()
  const rows = res.results ?? []
  let deleted = 0
  let failed = 0
  for (const row of rows) {
    try {
      await env.PACKAGES.delete(row.key)
      await env.DB.prepare(`DELETE FROM pending_r2_cleanup WHERE key = ?`)
        .bind(row.key)
        .run()
      deleted++
    } catch {
      await env.DB.prepare(
        `UPDATE pending_r2_cleanup SET retries = retries + 1 WHERE key = ?`,
      )
        .bind(row.key)
        .run()
      failed++
    }
  }
  return { attempted: rows.length, deleted, failed }
}

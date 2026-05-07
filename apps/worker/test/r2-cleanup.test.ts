import { describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { runR2Cleanup, schedulePackageDeletion } from '../src/lib/r2-cleanup'

describe('r2 cleanup queue', () => {
  it('schedules and processes pending deletions', async () => {
    await env.PACKAGES.put('cleanup/a.bin', new Uint8Array([1, 2, 3]))
    await env.PACKAGES.put('cleanup/b.bin', new Uint8Array([4, 5, 6]))
    await schedulePackageDeletion(env, ['cleanup/a.bin', 'cleanup/b.bin'])

    const pending = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM pending_r2_cleanup`,
    ).first<{ c: number }>()
    expect(pending?.c).toBe(2)

    const result = await runR2Cleanup(env)
    expect(result.attempted).toBe(2)
    expect(result.deleted).toBe(2)
    expect(result.failed).toBe(0)

    const a = await env.PACKAGES.head('cleanup/a.bin')
    const b = await env.PACKAGES.head('cleanup/b.bin')
    expect(a).toBeNull()
    expect(b).toBeNull()

    const remaining = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM pending_r2_cleanup`,
    ).first<{ c: number }>()
    expect(remaining?.c).toBe(0)
  })

  it('upserts the same key without duplication', async () => {
    await schedulePackageDeletion(env, ['dup/x.bin'])
    await schedulePackageDeletion(env, ['dup/x.bin'])
    const c = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM pending_r2_cleanup WHERE key = ?`,
    )
      .bind('dup/x.bin')
      .first<{ c: number }>()
    expect(c?.c).toBe(1)
  })

  it('skips entries with retries >= 5', async () => {
    await env.DB.prepare(
      `INSERT INTO pending_r2_cleanup (key, created_at, retries) VALUES (?, ?, 5)`,
    )
      .bind('skip/a.bin', Date.now())
      .run()
    const result = await runR2Cleanup(env)
    expect(result.attempted).toBe(0)
  })
})

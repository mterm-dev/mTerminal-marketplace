import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

describe('config', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mtx-test-'))
    process.env.MTX_HOME = tmpDir
  })

  afterEach(async () => {
    delete process.env.MTX_HOME
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns defaults when no config file exists', async () => {
    const { loadConfig } = await import('./config')
    const cfg = await loadConfig()
    expect(cfg.endpoint).toBeTruthy()
    expect(cfg.apiKey).toBeUndefined()
  })

  it('persists and reloads', async () => {
    const { loadConfig, updateConfig } = await import('./config')
    await updateConfig({ apiKey: 'mtx_test', authorId: 'gh-1', githubLogin: 'me' })
    const cfg = await loadConfig()
    expect(cfg.apiKey).toBe('mtx_test')
    expect(cfg.authorId).toBe('gh-1')
  })

  it('writes config with mode 0600', async () => {
    const { updateConfig, configPath } = await import('./config')
    await updateConfig({ apiKey: 'mtx_test' })
    const stat = await fs.stat(configPath())
    const mode = stat.mode & 0o777
    expect(mode).toBe(0o600)
  })
})

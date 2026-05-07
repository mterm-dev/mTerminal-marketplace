import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

export interface MtxConfig {
  endpoint: string
  authorId?: string
  apiKey?: string
  githubLogin?: string
  activeKeyId?: string
}

export function configDir(): string {
  return process.env.MTX_HOME ?? path.join(os.homedir(), '.mtx')
}

export function configPath(): string {
  return path.join(configDir(), 'config.json')
}

export function defaultEndpoint(): string {
  return process.env.MTX_ENDPOINT ?? 'https://marketplace.mterminal.dev'
}

export async function loadConfig(): Promise<MtxConfig> {
  const file = configPath()
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as Partial<MtxConfig>
    return {
      endpoint: parsed.endpoint ?? defaultEndpoint(),
      authorId: parsed.authorId,
      apiKey: parsed.apiKey,
      githubLogin: parsed.githubLogin,
      activeKeyId: parsed.activeKeyId,
    }
  } catch {
    return { endpoint: defaultEndpoint() }
  }
}

export async function saveConfig(cfg: MtxConfig): Promise<void> {
  const dir = configDir()
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  const file = configPath()
  await fs.writeFile(file, JSON.stringify(cfg, null, 2), { mode: 0o600 })
}

export async function updateConfig(patch: Partial<MtxConfig>): Promise<MtxConfig> {
  const cfg = await loadConfig()
  const next: MtxConfig = { ...cfg, ...patch }
  await saveConfig(next)
  return next
}

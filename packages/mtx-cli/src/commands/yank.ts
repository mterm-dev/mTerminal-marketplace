import pc from 'picocolors'
import { loadConfig } from '../lib/config'
import { yankVersion } from '../lib/api'

export async function yankCommand(id: string, version: string): Promise<void> {
  const cfg = await loadConfig()
  if (!cfg.apiKey) {
    console.log(pc.red('not logged in'))
    process.exit(1)
  }
  await yankVersion({ endpoint: cfg.endpoint, apiKey: cfg.apiKey }, id, version)
  console.log(pc.green(`yanked ${id}@${version}`))
}

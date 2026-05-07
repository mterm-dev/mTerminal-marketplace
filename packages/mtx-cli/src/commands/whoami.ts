import pc from 'picocolors'
import { loadConfig } from '../lib/config'

export async function whoamiCommand(): Promise<void> {
  const cfg = await loadConfig()
  if (!cfg.apiKey) {
    console.log(pc.yellow('not logged in'))
    return
  }
  console.log(`author : ${cfg.authorId ?? '(unknown)'}`)
  console.log(`login  : ${cfg.githubLogin ?? '(unknown)'}`)
  console.log(`key    : ${cfg.activeKeyId ?? '(none)'}`)
  console.log(`server : ${cfg.endpoint}`)
}

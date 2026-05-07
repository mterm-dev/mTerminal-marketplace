import fs from 'node:fs/promises'
import path from 'node:path'
import pc from 'picocolors'
import { loadConfig } from '../lib/config'
import { publishPackage } from '../lib/api'
import { packCommand } from './pack'

export interface PublishOptions {
  file?: string
  cwd?: string
  build?: boolean
}

export async function publishCommand(opts: PublishOptions = {}): Promise<void> {
  const cfg = await loadConfig()
  if (!cfg.apiKey) {
    console.log(pc.red('not logged in. run `mtx login` first.'))
    process.exit(1)
  }

  let file: string
  if (opts.file) {
    file = path.resolve(opts.file)
  } else {
    file = await packCommand({ cwd: opts.cwd, build: opts.build })
  }

  const buf = new Uint8Array(await fs.readFile(file))
  console.log(pc.cyan(`uploading ${path.basename(file)} (${buf.length} bytes)...`))
  const result = await publishPackage(
    { endpoint: cfg.endpoint, apiKey: cfg.apiKey },
    buf,
  )
  if (result.ok) {
    console.log(pc.green(`published ${result.id}@${result.version}`))
    return
  }
  console.log(pc.red('publish failed:'))
  for (const e of result.errors ?? []) {
    console.log(pc.red(`  [${e.code}]`))
    for (const issue of e.issues) {
      const loc = issue.path
        ? ` (${issue.path}${issue.line ? `:${issue.line}` : ''}${issue.col ? `:${issue.col}` : ''})`
        : ''
      console.log(`    - ${issue.message}${loc}`)
    }
  }
  process.exit(1)
}

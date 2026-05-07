import fs from 'node:fs/promises'
import path from 'node:path'
import pc from 'picocolors'
import { pack } from '../lib/pack'
import { loadConfig } from '../lib/config'
import { readPrivKey } from '../lib/keystore'

export interface PackCommandOptions {
  cwd?: string
  out?: string
  build?: boolean
}

import { spawn } from 'node:child_process'

function runNpmBuild(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], { cwd, stdio: 'inherit' })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`npm run build exited with ${code}`))
    })
    child.on('error', reject)
  })
}

export async function packCommand(opts: PackCommandOptions = {}): Promise<string> {
  const cwd = path.resolve(opts.cwd ?? process.cwd())
  const cfg = await loadConfig()
  if (!cfg.authorId || !cfg.activeKeyId) {
    console.log(pc.red('not configured. run `mtx login` and `mtx keygen` first.'))
    process.exit(1)
  }

  if (opts.build !== false) {
    const pkgPath = path.join(cwd, 'package.json')
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as { scripts?: Record<string, string> }
    if (pkg.scripts?.build) await runNpmBuild(cwd)
  }

  const priv = await readPrivKey(cfg.activeKeyId)
  const result = await pack({
    cwd,
    authorId: cfg.authorId,
    keyId: cfg.activeKeyId,
    privKey: priv,
  })

  const out = path.resolve(opts.out ?? `${result.manifestId}-${result.version}.mtx`)
  await fs.writeFile(out, result.buf)
  console.log(pc.green(`packed ${result.manifestId}@${result.version} → ${out} (${result.buf.length} bytes)`))
  return out
}

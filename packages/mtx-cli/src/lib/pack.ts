import fs from 'node:fs/promises'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { signEntries, type PackEntry } from './sign'
import { validateManifest } from '@mterminal/manifest-validator'

const INCLUDED_DIRS = ['dist', 'themes']
const INCLUDED_FILES = ['package.json', 'README.md', 'readme.md', 'icon.png']

async function walk(root: string, prefix = ''): Promise<PackEntry[]> {
  const out: PackEntry[] = []
  let stat: { isDirectory(): boolean; isFile(): boolean }
  try {
    stat = await fs.stat(root)
  } catch {
    return out
  }
  if (!stat.isDirectory()) return out
  const entries = await fs.readdir(root, { withFileTypes: true })
  for (const e of entries) {
    const abs = path.join(root, e.name)
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) {
      out.push(...(await walk(abs, rel)))
    } else if (e.isFile()) {
      const content = await fs.readFile(abs)
      out.push({ path: rel, content: new Uint8Array(content) })
    }
  }
  return out
}

export interface PackOptions {
  cwd: string
  authorId: string
  keyId: string
  privKey: Uint8Array
}

export interface PackResult {
  buf: Uint8Array
  manifestId: string
  version: string
}

export async function pack(opts: PackOptions): Promise<PackResult> {
  const pkgPath = path.join(opts.cwd, 'package.json')
  const raw = await fs.readFile(pkgPath, 'utf8')
  const pkg = JSON.parse(raw) as Record<string, unknown>

  const mt = (pkg.mterminal ?? {}) as Record<string, unknown>
  const publisher = (mt.publisher ?? {}) as Record<string, unknown>
  if (publisher.authorId !== opts.authorId || publisher.keyId !== opts.keyId) {
    mt.publisher = { authorId: opts.authorId, keyId: opts.keyId }
    pkg.mterminal = mt
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  }

  const validation = validateManifest(pkg)
  if (!validation.ok) {
    throw new Error(`manifest invalid:\n  - ${validation.errors.join('\n  - ')}`)
  }

  const entries: PackEntry[] = []
  entries.push({
    path: 'package.json',
    content: new Uint8Array(await fs.readFile(pkgPath)),
  })
  for (const dir of INCLUDED_DIRS) {
    entries.push(...(await walk(path.join(opts.cwd, dir), dir)))
  }
  for (const file of INCLUDED_FILES) {
    if (file === 'package.json') continue
    const abs = path.join(opts.cwd, file)
    try {
      const buf = await fs.readFile(abs)
      entries.push({ path: file, content: new Uint8Array(buf) })
    } catch {}
  }

  const sigB64 = await signEntries(entries, opts.privKey)
  entries.push({ path: 'signature.sig', content: strToU8(sigB64) })

  const zipMap: Record<string, Uint8Array> = {}
  for (const e of entries) zipMap[e.path] = e.content
  const buf = zipSync(zipMap)

  return {
    buf,
    manifestId: validation.manifest.id,
    version: validation.manifest.version,
  }
}

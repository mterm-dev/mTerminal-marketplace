import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import prompts from 'prompts'
import pc from 'picocolors'
import { loadConfig } from '../lib/config'

interface InitAnswers {
  id: string
  displayName: string
  category: string
  dir: string
}

const CATEGORIES = ['productivity', 'language', 'theme', 'remote', 'ai', 'git', 'other']

function templatesDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..', 'templates', 'minimal')
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const items = await fs.readdir(src, { withFileTypes: true })
  for (const item of items) {
    const s = path.join(src, item.name)
    const d = path.join(dest, item.name)
    if (item.isDirectory()) await copyDir(s, d)
    else await fs.copyFile(s, d)
  }
}

export async function initCommand(suggestedName?: string): Promise<void> {
  const cfg = await loadConfig()
  const answers = (await prompts([
    {
      type: 'text',
      name: 'id',
      message: 'extension id (kebab-case)',
      initial: suggestedName ?? '',
      validate: (v: string) =>
        /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(v) ? true : 'must be kebab-case',
    },
    {
      type: 'text',
      name: 'displayName',
      message: 'display name',
      initial: (prev: string) => prev,
    },
    {
      type: 'select',
      name: 'category',
      message: 'category',
      choices: CATEGORIES.map((c) => ({ title: c, value: c })),
      initial: 6,
    },
    {
      type: 'text',
      name: 'dir',
      message: 'directory',
      initial: (_p: unknown, all: { id: string }) => `./${all.id}`,
    },
  ])) as InitAnswers

  if (!answers.id) {
    console.log(pc.yellow('aborted'))
    return
  }

  const target = path.resolve(answers.dir)
  await copyDir(templatesDir(), target)

  const pkgPath = path.join(target, 'package.json')
  const raw = await fs.readFile(pkgPath, 'utf8')
  const pkg = JSON.parse(raw) as Record<string, unknown>
  pkg.name = `mterminal-plugin-${answers.id}`
  const mt = (pkg.mterminal ?? {}) as Record<string, unknown>
  mt.id = answers.id
  mt.displayName = answers.displayName || answers.id
  mt.category = answers.category
  if (cfg.authorId && cfg.activeKeyId) {
    mt.publisher = { authorId: cfg.authorId, keyId: cfg.activeKeyId }
  }
  pkg.mterminal = mt
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  console.log(pc.green(`created ${path.relative(process.cwd(), target)}`))
  console.log('next:')
  console.log('  cd', path.relative(process.cwd(), target))
  console.log('  npm i')
  console.log('  npm run build')
  console.log('  mtx pack')
  console.log('  mtx publish')
}

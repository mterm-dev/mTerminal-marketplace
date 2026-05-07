import { cac } from 'cac'
import { initCommand } from './commands/init'
import { loginCommand } from './commands/login'
import { keygenCommand } from './commands/keygen'
import { packCommand } from './commands/pack'
import { publishCommand } from './commands/publish'
import { yankCommand } from './commands/yank'
import { whoamiCommand } from './commands/whoami'

const VERSION = '0.1.0'

export async function run(argv: string[]): Promise<void> {
  const cli = cac('mtx')

  cli
    .command('init [name]', 'scaffold a new extension')
    .action(async (name?: string) => initCommand(name))

  cli.command('login', 'authenticate via github device flow').action(async () => loginCommand())

  cli
    .command('keygen', 'generate and register a new ed25519 keypair')
    .option('--name <name>', 'human-readable name for the key')
    .action(async (opts: { name?: string }) => keygenCommand({ name: opts.name }))

  cli
    .command('pack', 'build and bundle the extension into a .mtx file')
    .option('--out <file>', 'output file path')
    .option('--no-build', 'skip npm run build')
    .action(async (opts: { out?: string; build?: boolean }) =>
      packCommand({ out: opts.out, build: opts.build }),
    )

  cli
    .command('publish', 'pack and upload to the marketplace')
    .option('--file <file>', 'use an existing .mtx file instead of packing')
    .option('--no-build', 'skip npm run build when packing')
    .action(async (opts: { file?: string; build?: boolean }) =>
      publishCommand({ file: opts.file, build: opts.build }),
    )

  cli
    .command('yank <id> <version>', 'mark a published version as yanked')
    .action(async (id: string, version: string) => yankCommand(id, version))

  cli.command('whoami', 'show current login info').action(async () => whoamiCommand())

  cli.help()
  cli.version(VERSION)

  cli.parse(['node', 'mtx', ...argv], { run: false })
  await cli.runMatchedCommand()
}

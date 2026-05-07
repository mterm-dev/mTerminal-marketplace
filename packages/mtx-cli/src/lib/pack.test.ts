import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { unzipSync } from 'fflate'
import { pack } from './pack'
import { generateKeyPair } from './sign'

describe('pack', () => {
  let cwd: string

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'mtx-pack-'))
  })

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true })
  })

  async function scaffold(extras?: { capabilities?: string[]; allowedNetworkDomains?: string[] }) {
    const pkg = {
      name: 'mterminal-plugin-pack-demo',
      version: '0.2.0',
      main: 'dist/main.cjs',
      engines: { 'mterminal-api': '^1.0.0' },
      mterminal: {
        id: 'pack-demo',
        displayName: 'pack demo',
        category: 'other',
        publisher: { authorId: '', keyId: '' },
        activationEvents: ['onStartupFinished'],
        capabilities: extras?.capabilities ?? ['clipboard'],
        allowedNetworkDomains: extras?.allowedNetworkDomains ?? [],
        contributes: {},
      },
    }
    await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify(pkg, null, 2))
    await fs.mkdir(path.join(cwd, 'dist'), { recursive: true })
    await fs.writeFile(
      path.join(cwd, 'dist', 'main.cjs'),
      'module.exports = { activate(){}, deactivate(){} }\n',
    )
    await fs.writeFile(path.join(cwd, 'README.md'), '# pack-demo\n')
  }

  it('packs a working extension and rewrites publisher fields', async () => {
    await scaffold()
    const { priv } = await generateKeyPair()
    const result = await pack({
      cwd,
      authorId: 'gh-99',
      keyId: 'gh-99:key1',
      privKey: priv,
    })
    expect(result.manifestId).toBe('pack-demo')
    expect(result.version).toBe('0.2.0')

    const entries = unzipSync(result.buf)
    expect(Object.keys(entries).sort()).toEqual([
      'README.md',
      'dist/main.cjs',
      'package.json',
      'signature.sig',
    ])

    const pkg = JSON.parse(new TextDecoder().decode(entries['package.json']!))
    expect(pkg.mterminal.publisher.authorId).toBe('gh-99')
    expect(pkg.mterminal.publisher.keyId).toBe('gh-99:key1')
  })

  it('refuses to pack an invalid manifest', async () => {
    const pkg = {
      name: 'mterminal-plugin-bad',
      version: 'not-a-semver',
      main: 'dist/main.cjs',
      engines: { 'mterminal-api': '^1.0.0' },
      mterminal: {
        id: 'BadId',
        publisher: { authorId: '', keyId: '' },
        activationEvents: ['onStartupFinished'],
        capabilities: [],
        contributes: {},
      },
    }
    await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify(pkg))
    await fs.mkdir(path.join(cwd, 'dist'), { recursive: true })
    await fs.writeFile(path.join(cwd, 'dist', 'main.cjs'), 'module.exports = {}\n')

    const { priv } = await generateKeyPair()
    await expect(
      pack({ cwd, authorId: 'gh-1', keyId: 'gh-1:key1', privKey: priv }),
    ).rejects.toThrow(/manifest invalid/)
  })

  it('produces signature.sig that matches the deterministic hash', async () => {
    await scaffold()
    const { priv } = await generateKeyPair()
    const a = await pack({ cwd, authorId: 'gh-1', keyId: 'gh-1:key1', privKey: priv })
    const b = await pack({ cwd, authorId: 'gh-1', keyId: 'gh-1:key1', privKey: priv })
    const sigA = unzipSync(a.buf)['signature.sig']!
    const sigB = unzipSync(b.buf)['signature.sig']!
    expect(new TextDecoder().decode(sigA)).toBe(new TextDecoder().decode(sigB))
  })
})

import { describe, expect, it } from 'vitest'
import { validateManifest } from './index'

const baseManifest = () => ({
  name: 'mterminal-plugin-demo',
  version: '1.0.0',
  main: 'dist/main.cjs',
  engines: { 'mterminal-api': '^1.0.0' },
  mterminal: {
    id: 'demo',
    displayName: 'demo',
    publisher: { authorId: 'gh-1234', keyId: 'gh-1234:key1' },
    activationEvents: ['onStartupFinished'],
    capabilities: ['clipboard'],
    contributes: {},
  },
})

describe('validateManifest', () => {
  it('accepts a minimal valid manifest', () => {
    const result = validateManifest(baseManifest())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.id).toBe('demo')
      expect(result.manifest.publisher.authorId).toBe('gh-1234')
    }
  })

  it('rejects missing mterminal block', () => {
    const result = validateManifest({ name: 'foo', version: '1.0.0' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/mterminal/)
  })

  it('rejects non-kebab-case id', () => {
    const m = baseManifest()
    m.mterminal.id = 'BadName'
    const result = validateManifest(m)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/kebab-case/)
  })

  it('rejects bad semver', () => {
    const m = baseManifest()
    m.version = 'not-a-version'
    const result = validateManifest(m)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/semver/)
  })

  it('rejects missing publisher.authorId', () => {
    const m: any = baseManifest()
    delete m.mterminal.publisher.authorId
    const result = validateManifest(m)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/authorId/)
  })

  it('rejects unknown capability', () => {
    const m = baseManifest()
    m.mterminal.capabilities = ['rootkit'] as any
    const result = validateManifest(m)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/whitelist/)
  })

  it('requires allowedNetworkDomains for network:full', () => {
    const m = baseManifest()
    m.mterminal.capabilities = ['network:full']
    const result = validateManifest(m)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/allowedNetworkDomains/)
  })

  it('accepts network:full with allowedNetworkDomains', () => {
    const m: any = baseManifest()
    m.mterminal.capabilities = ['network:full']
    m.mterminal.allowedNetworkDomains = ['api.example.com']
    const result = validateManifest(m)
    expect(result.ok).toBe(true)
  })

  it('rejects invalid activation event', () => {
    const m = baseManifest()
    m.mterminal.activationEvents = ['onAlien:foo'] as any
    const result = validateManifest(m)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/activation/)
  })

  it('requires at least one of main/renderer/declarative themes', () => {
    const m: any = baseManifest()
    delete m.main
    const result = validateManifest(m)
    expect(result.ok).toBe(false)
  })

  it('accepts theme-only declarative manifest', () => {
    const m: any = baseManifest()
    delete m.main
    m.mterminal.contributes = {
      themes: [{ id: 'foo', label: 'foo', path: './themes/foo.json' }],
    }
    const result = validateManifest(m)
    expect(result.ok).toBe(true)
  })
})

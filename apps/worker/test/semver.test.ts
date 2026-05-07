import { describe, expect, it } from 'vitest'
import { compareSemver, isLater, parseSemver } from '../src/lib/semver'

describe('parseSemver', () => {
  it('parses major.minor.patch', () => {
    expect(parseSemver('1.2.3')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: null,
    })
  })

  it('parses prerelease', () => {
    expect(parseSemver('1.2.3-rc.1')?.prerelease).toBe('rc.1')
  })

  it('returns null on garbage', () => {
    expect(parseSemver('not.a.version')).toBeNull()
  })
})

describe('compareSemver', () => {
  it('orders by major', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBeGreaterThan(0)
  })

  it('orders by minor when major matches', () => {
    expect(compareSemver('1.2.0', '1.1.9')).toBeGreaterThan(0)
  })

  it('orders by patch when major and minor match', () => {
    expect(compareSemver('1.0.5', '1.0.4')).toBeGreaterThan(0)
  })

  it('puts prerelease behind release', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBeLessThan(0)
  })

  it('returns 0 for identical versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0)
  })
})

describe('isLater', () => {
  it('returns true for any version when current is empty', () => {
    expect(isLater('0.0.1', '')).toBe(true)
  })

  it('returns true when candidate is later', () => {
    expect(isLater('2.0.0', '1.9.9')).toBe(true)
  })

  it('returns false when candidate is the same or older', () => {
    expect(isLater('1.0.0', '1.0.0')).toBe(false)
    expect(isLater('1.0.0', '2.0.0')).toBe(false)
  })
})

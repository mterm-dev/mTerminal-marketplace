const SEMVER_RE =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/

export interface ParsedSemver {
  major: number
  minor: number
  patch: number
  prerelease: string | null
}

export function parseSemver(v: string): ParsedSemver | null {
  const m = SEMVER_RE.exec(v.trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
  }
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa && !pb) return 0
  if (!pa) return -1
  if (!pb) return 1
  if (pa.major !== pb.major) return pa.major - pb.major
  if (pa.minor !== pb.minor) return pa.minor - pb.minor
  if (pa.patch !== pb.patch) return pa.patch - pb.patch
  if (pa.prerelease && !pb.prerelease) return -1
  if (!pa.prerelease && pb.prerelease) return 1
  if (pa.prerelease && pb.prerelease) return pa.prerelease.localeCompare(pb.prerelease)
  return 0
}

export function isLater(candidate: string, current: string): boolean {
  if (!current) return true
  return compareSemver(candidate, current) > 0
}

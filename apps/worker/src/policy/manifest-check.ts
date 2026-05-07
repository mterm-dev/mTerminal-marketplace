import { validateManifest, type ExtensionManifest } from '@mterminal/manifest-validator'
import type { PolicyError } from '@mterminal/marketplace-types'

export interface ManifestCheckOk {
  ok: true
  manifest: ExtensionManifest
}

export interface ManifestCheckErr {
  ok: false
  error: PolicyError
}

export type ManifestCheckResult = ManifestCheckOk | ManifestCheckErr

export function checkManifest(raw: unknown): ManifestCheckResult {
  const result = validateManifest(raw)
  if (!result.ok) {
    return {
      ok: false,
      error: {
        code: 'manifest',
        issues: result.errors.map((m) => ({ message: m })),
      },
    }
  }
  return { ok: true, manifest: result.manifest }
}

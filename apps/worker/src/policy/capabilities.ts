import { CAPABILITY_WHITELIST, type Capability } from '@mterminal/manifest-validator'
import type { PolicyError } from '@mterminal/marketplace-types'

export interface CapabilityCheckOk {
  ok: true
}

export interface CapabilityCheckErr {
  ok: false
  error: PolicyError
}

export type CapabilityCheckResult = CapabilityCheckOk | CapabilityCheckErr

export function checkCapabilities(
  capabilities: string[],
  allowedNetworkDomains: string[],
): CapabilityCheckResult {
  const issues: { message: string }[] = []
  for (const cap of capabilities) {
    if (!CAPABILITY_WHITELIST.includes(cap as Capability)) {
      issues.push({ message: `capability "${cap}" is not in the whitelist` })
    }
  }
  if (capabilities.includes('network:full') && allowedNetworkDomains.length === 0) {
    issues.push({
      message: '"network:full" requires "mterminal.allowedNetworkDomains" with at least one entry',
    })
  }
  if (issues.length) return { ok: false, error: { code: 'capability', issues } }
  return { ok: true }
}

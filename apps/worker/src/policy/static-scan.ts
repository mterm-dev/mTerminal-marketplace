import type { PolicyError, PolicyIssue } from '@mterminal/marketplace-types'
import type { UnzippedEntry } from './signature-check'

interface ForbiddenPattern {
  re: RegExp
  message: string
}

const PATTERNS: ForbiddenPattern[] = [
  { re: /\beval\s*\(/g, message: 'use of eval() is not allowed' },
  { re: /new\s+Function\s*\(/g, message: 'use of new Function() is not allowed' },
  { re: /Function\.constructor/g, message: 'access to Function.constructor is not allowed' },
  {
    re: /import\s*\(\s*['"]https?:\/\//g,
    message: 'dynamic import from http(s) URL is not allowed',
  },
]

const SCANNED_EXT = ['.cjs', '.mjs', '.js']

export interface StaticScanOk {
  ok: true
}

export interface StaticScanErr {
  ok: false
  error: PolicyError
}

export type StaticScanResult = StaticScanOk | StaticScanErr

export function staticScan(entries: UnzippedEntry[]): StaticScanResult {
  const issues: PolicyIssue[] = []
  for (const entry of entries) {
    if (!SCANNED_EXT.some((ext) => entry.path.endsWith(ext))) continue
    const text = new TextDecoder('utf-8').decode(entry.content)
    for (const p of PATTERNS) {
      p.re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = p.re.exec(text)) !== null) {
        const upTo = text.slice(0, m.index)
        const line = upTo.split('\n').length
        const lastNl = upTo.lastIndexOf('\n')
        const col = m.index - lastNl
        issues.push({ message: p.message, path: entry.path, line, col })
      }
    }
  }
  if (issues.length) return { ok: false, error: { code: 'static-scan', issues } }
  return { ok: true }
}

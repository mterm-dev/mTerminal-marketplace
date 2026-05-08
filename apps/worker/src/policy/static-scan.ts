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

const ALLOWED_PREFIXES = ['./', '../', '/', 'mt-ext://', 'https://', 'data:']
const ALLOWED_EXACT = new Set(['@mterminal/extension-api'])

const STATIC_IMPORT_RE =
  /(?:^|[\n;}])\s*(?:import|export)\b[^'"`;{}\n]*?\bfrom\s*(['"])([^'"\n]+)\1/g
const SIDE_EFFECT_IMPORT_RE =
  /(?:^|[\n;}])\s*import\s*(['"])([^'"\n]+)\1/g
const DYNAMIC_IMPORT_RE =
  /(?<![\w$.'"`\\])import\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g

function isAllowedSpecifier(spec: string): boolean {
  if (ALLOWED_EXACT.has(spec)) return true
  for (const prefix of ALLOWED_PREFIXES) {
    if (spec.startsWith(prefix)) return true
  }
  return false
}

function lineCol(text: string, index: number): { line: number; col: number } {
  const upTo = text.slice(0, index)
  const line = upTo.split('\n').length
  const lastNl = upTo.lastIndexOf('\n')
  const col = index - lastNl
  return { line, col }
}

export function findBareImports(entries: UnzippedEntry[]): PolicyIssue[] {
  const issues: PolicyIssue[] = []
  for (const entry of entries) {
    if (!entry.path.startsWith('dist/') || !entry.path.endsWith('.mjs')) continue
    const text = new TextDecoder('utf-8').decode(entry.content)
    for (const re of [STATIC_IMPORT_RE, SIDE_EFFECT_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const spec = m[2]
        if (!spec || isAllowedSpecifier(spec)) continue
        const specStart = m.index + m[0].lastIndexOf(spec)
        const { line, col } = lineCol(text, specStart)
        issues.push({
          message: `bare module specifier "${spec}" — bundle dependencies into dist/`,
          path: entry.path,
          line,
          col,
        })
      }
    }
  }
  return issues
}

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
        const { line, col } = lineCol(text, m.index)
        issues.push({ message: p.message, path: entry.path, line, col })
      }
    }
  }
  issues.push(...findBareImports(entries))
  if (issues.length) return { ok: false, error: { code: 'static-scan', issues } }
  return { ok: true }
}

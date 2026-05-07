export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export function fmtNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

export function fmtDate(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export function fmtRelative(ms: number): string {
  if (!ms) return '—'
  const diff = Date.now() - ms
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return fmtDate(ms)
}

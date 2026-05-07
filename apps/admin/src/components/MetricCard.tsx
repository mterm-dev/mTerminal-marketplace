import { Card } from './ui'
import { fmtNumber } from '../lib/cn'

interface Props {
  label: string
  value: number
  hint?: string
}

export function MetricCard({ label, value, hint }: Props) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-zinc-100">{fmtNumber(value)}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </Card>
  )
}

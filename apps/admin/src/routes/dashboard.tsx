import { Link } from 'react-router-dom'
import { useDashboard } from '../api/hooks'
import { MetricCard } from '../components/MetricCard'
import { Card, Spinner } from '../components/ui'
import { fmtBytes, fmtNumber, fmtRelative } from '../lib/cn'

export function DashboardPage() {
  const q = useDashboard()
  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Spinner /> loading dashboard…
      </div>
    )
  }
  if (q.error || !q.data) {
    return <p className="text-sm text-red-300">failed to load dashboard.</p>
  }
  const m = q.data

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-zinc-100">dashboard</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <MetricCard label="extensions" value={m.extensionsTotal} />
        <MetricCard label="versions" value={m.versionsTotal} />
        <MetricCard label="authors" value={m.authorsTotal} />
        <MetricCard label="downloads · 7d" value={m.downloadsLast7d} />
        <MetricCard label="pending reports" value={m.pendingReports} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold text-zinc-200">top extensions</h2>
          {m.topExtensions.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">no extensions yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-800">
              {m.topExtensions.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <Link
                    to={`/extensions/${encodeURIComponent(e.id)}`}
                    className="truncate text-zinc-200 hover:text-white"
                  >
                    {e.displayName}{' '}
                    <span className="text-xs text-zinc-500">{e.id}</span>
                  </Link>
                  <span className="text-zinc-400">
                    {fmtNumber(e.downloadTotal)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="text-sm font-semibold text-zinc-200">recent versions</h2>
          {m.recentVersions.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">no versions yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-800">
              {m.recentVersions.map((v) => (
                <li
                  key={`${v.extId}@${v.version}`}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <Link
                    to={`/extensions/${encodeURIComponent(v.extId)}`}
                    className="truncate text-zinc-200 hover:text-white"
                  >
                    {v.extId}{' '}
                    <span className="text-xs text-zinc-500">@ {v.version}</span>
                  </Link>
                  <span className="text-xs text-zinc-500">
                    {fmtBytes(v.sizeBytes)} · {fmtRelative(v.publishedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

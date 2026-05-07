import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAudit } from '../api/hooks'
import { DataTable, Pagination, type Column } from '../components/DataTable'
import { Badge, Spinner } from '../components/ui'
import { fmtDate } from '../lib/cn'
import type { AdminAuditEntry } from '../api/client'

const PAGE_SIZE = 50

export function AuditPage() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(0, Number(params.get('page') ?? '0'))

  const apiParams = useMemo(() => {
    const u = new URLSearchParams()
    u.set('page', String(page))
    u.set('pageSize', String(PAGE_SIZE))
    return u
  }, [page])

  const data = useAudit(apiParams)

  const columns: Column<AdminAuditEntry>[] = [
    {
      key: 'when',
      header: 'when',
      render: (r) => (
        <span className="font-mono text-xs text-zinc-400">{fmtDate(r.createdAt)}</span>
      ),
    },
    {
      key: 'admin',
      header: 'admin',
      render: (r) => <span className="text-zinc-200">{r.adminLogin}</span>,
    },
    {
      key: 'action',
      header: 'action',
      render: (r) => <Badge tone="accent">{r.action}</Badge>,
    },
    {
      key: 'target',
      header: 'target',
      render: (r) => (
        <span className="font-mono text-xs text-zinc-300">{r.target ?? '—'}</span>
      ),
    },
    {
      key: 'payload',
      header: 'payload',
      render: (r) =>
        r.payload ? (
          <code className="block max-w-md truncate text-xs text-zinc-400">
            {JSON.stringify(r.payload)}
          </code>
        ) : (
          <span className="text-xs text-zinc-600">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-100">audit log</h1>
      <p className="text-sm text-zinc-400">
        every administrative mutation is recorded here. older entries are at the bottom of pages.
      </p>

      {data.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner /> loading…
        </div>
      ) : data.error || !data.data ? (
        <p className="text-sm text-red-300">failed to load audit log.</p>
      ) : (
        <>
          <DataTable
            rows={data.data.items}
            columns={columns}
            rowKey={(r) => r.id}
            empty="no audit entries yet."
          />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data.data.total}
            onPage={(n) => {
              const next = new URLSearchParams(params)
              next.set('page', String(n))
              setParams(next, { replace: true })
            }}
          />
        </>
      )}
    </div>
  )
}

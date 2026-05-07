import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useAuthors,
  useBanAuthor,
  useRevokeAllKeys,
  useRevokeApiKey,
} from '../api/hooks'
import { DataTable, Pagination, type Column } from '../components/DataTable'
import { Badge, Button, Input, Spinner } from '../components/ui'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { fmtNumber, fmtRelative } from '../lib/cn'
import type { AdminAuthorRow } from '../api/client'

const PAGE_SIZE = 40

export function AuthorsPage() {
  const [params, setParams] = useSearchParams()
  const page = Math.max(0, Number(params.get('page') ?? '0'))
  const q = params.get('q') ?? ''

  const apiParams = useMemo(() => {
    const u = new URLSearchParams()
    if (q) u.set('q', q)
    u.set('page', String(page))
    u.set('pageSize', String(PAGE_SIZE))
    return u
  }, [q, page])

  const data = useAuthors(apiParams)
  const ban = useBanAuthor()
  const revokeKey = useRevokeApiKey()
  const revokeAll = useRevokeAllKeys()

  const [confirm, setConfirm] = useState<{
    kind: 'revoke-key' | 'revoke-all'
    id: string
    login: string
  } | null>(null)

  function set(name: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    if (name !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const columns: Column<AdminAuthorRow>[] = [
    {
      key: 'login',
      header: 'github login',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-zinc-100">{r.githubLogin}</span>
          <span className="text-xs text-zinc-500">{r.id}</span>
        </div>
      ),
    },
    {
      key: 'extensions',
      header: 'extensions',
      align: 'right',
      render: (r) => <span className="font-mono text-xs">{r.extensionsCount}</span>,
    },
    {
      key: 'downloads',
      header: 'downloads',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs">{fmtNumber(r.totalDownloads)}</span>
      ),
    },
    {
      key: 'created',
      header: 'joined',
      render: (r) => (
        <span className="text-xs text-zinc-400">{fmtRelative(r.createdAt)}</span>
      ),
    },
    {
      key: 'banned',
      header: 'status',
      render: (r) =>
        r.banned ? <Badge tone="danger">banned</Badge> : <Badge tone="success">active</Badge>,
    },
    {
      key: 'actions',
      header: 'actions',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={r.banned ? 'secondary' : 'danger'}
            onClick={() => ban.mutate({ id: r.id, ban: !r.banned })}
          >
            {r.banned ? 'unban' : 'ban'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setConfirm({ kind: 'revoke-key', id: r.id, login: r.githubLogin })
            }
          >
            rotate key
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setConfirm({ kind: 'revoke-all', id: r.id, login: r.githubLogin })
            }
          >
            revoke pubkeys
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-100">authors</h1>
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="search login or id"
          aria-label="search authors"
          className="min-w-64 flex-1"
        />
      </div>

      {data.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner /> loading…
        </div>
      ) : data.error || !data.data ? (
        <p className="text-sm text-red-300">failed to load authors.</p>
      ) : (
        <>
          <DataTable
            rows={data.data.items}
            columns={columns}
            rowKey={(r) => r.id}
            empty="no authors yet."
          />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data.data.total}
            onPage={(n) => set('page', String(n))}
          />
        </>
      )}

      <ConfirmDialog
        open={!!confirm && confirm.kind === 'revoke-key'}
        title={`rotate api key for ${confirm?.login ?? ''}?`}
        description="this regenerates the api key hash. the author will need to re-login via mtx cli before publishing again. cannot be undone."
        confirmLabel="rotate"
        variant="danger"
        busy={revokeKey.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return
          await revokeKey.mutateAsync(confirm.id)
          setConfirm(null)
        }}
      />
      <ConfirmDialog
        open={!!confirm && confirm.kind === 'revoke-all'}
        title={`revoke all public keys for ${confirm?.login ?? ''}?`}
        description="all signing keys are revoked, all published versions are yanked. the author will need to register a new key before publishing."
        confirmLabel="revoke all"
        variant="danger"
        busy={revokeAll.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return
          await revokeAll.mutateAsync(confirm.id)
          setConfirm(null)
        }}
      />
    </div>
  )
}

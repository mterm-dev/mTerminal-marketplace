import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useExtensions } from '../api/hooks'
import { DataTable, Pagination, type Column } from '../components/DataTable'
import { Badge, Input, Select, Spinner } from '../components/ui'
import { fmtNumber } from '../lib/cn'
import type { AdminExtensionListItem } from '../api/client'

const PAGE_SIZE = 40

const CATEGORIES = [
  '',
  'productivity',
  'language',
  'theme',
  'remote',
  'ai',
  'git',
  'other',
]

export function ExtensionsListPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const page = Math.max(0, Number(params.get('page') ?? '0'))
  const q = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const curated = params.get('curated') ?? ''
  const recommended = params.get('recommended') ?? ''
  const sort = (params.get('sort') ?? 'downloads') as
    | 'downloads'
    | 'recent'
    | 'rating'
    | 'name'

  const apiParams = useMemo(() => {
    const u = new URLSearchParams()
    if (q) u.set('q', q)
    if (category) u.set('category', category)
    if (curated) u.set('curated', curated)
    if (recommended) u.set('recommended', recommended)
    if (sort) u.set('sort', sort)
    u.set('page', String(page))
    u.set('pageSize', String(PAGE_SIZE))
    return u
  }, [q, category, curated, recommended, sort, page])

  const data = useExtensions(apiParams)

  function set(name: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    if (name !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const columns: Column<AdminExtensionListItem>[] = [
    {
      key: 'id',
      header: 'id',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-zinc-100">{r.displayName}</span>
          <span className="text-xs text-zinc-500">{r.id}</span>
        </div>
      ),
    },
    {
      key: 'author',
      header: 'author',
      render: (r) => (
        <span className="text-zinc-300">{r.authorLogin ?? r.authorId}</span>
      ),
    },
    {
      key: 'category',
      header: 'category',
      render: (r) => <Badge tone="neutral">{r.category}</Badge>,
    },
    {
      key: 'latest',
      header: 'latest',
      render: (r) => (
        <span className="font-mono text-xs text-zinc-300">
          {r.latestVersion || '—'}
        </span>
      ),
    },
    {
      key: 'downloads',
      header: 'downloads',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs">{fmtNumber(r.downloadTotal)}</span>
      ),
    },
    {
      key: 'rating',
      header: 'rating',
      align: 'right',
      render: (r) =>
        r.avgStars != null ? (
          <span className="font-mono text-xs text-zinc-300">
            {r.avgStars.toFixed(1)} ({r.ratingCount})
          </span>
        ) : (
          <span className="text-xs text-zinc-600">—</span>
        ),
    },
    {
      key: 'flags',
      header: 'flags',
      render: (r) => (
        <div className="flex gap-1">
          {r.curated && <Badge tone="accent">curated</Badge>}
          {r.recommended && <Badge tone="success">recommended</Badge>}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-100">extensions</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="search id or name"
          aria-label="search"
          className="min-w-64 flex-1"
        />
        <Select
          value={category}
          onChange={(e) => set('category', e.target.value)}
          aria-label="filter category"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c || 'all categories'}
            </option>
          ))}
        </Select>
        <Select
          value={curated}
          onChange={(e) => set('curated', e.target.value)}
          aria-label="filter curated"
        >
          <option value="">curated · any</option>
          <option value="1">curated · yes</option>
          <option value="0">curated · no</option>
        </Select>
        <Select
          value={recommended}
          onChange={(e) => set('recommended', e.target.value)}
          aria-label="filter recommended"
        >
          <option value="">recommended · any</option>
          <option value="1">recommended · yes</option>
          <option value="0">recommended · no</option>
        </Select>
        <Select
          value={sort}
          onChange={(e) => set('sort', e.target.value)}
          aria-label="sort"
        >
          <option value="downloads">downloads</option>
          <option value="recent">recent</option>
          <option value="rating">rating</option>
          <option value="name">name</option>
        </Select>
      </div>

      {data.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner /> loading…
        </div>
      ) : data.error || !data.data ? (
        <p className="text-sm text-red-300">failed to load extensions.</p>
      ) : (
        <>
          <DataTable
            rows={data.data.items}
            columns={columns}
            rowKey={(r) => r.id}
            onRowClick={(r) =>
              navigate(`/extensions/${encodeURIComponent(r.id)}`)
            }
            empty="no extensions match the filters."
          />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data.data.total}
            onPage={(n) => set('page', String(n))}
          />
        </>
      )}
    </div>
  )
}

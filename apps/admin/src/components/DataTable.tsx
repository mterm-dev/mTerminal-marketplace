import type { ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: string
  width?: string
  align?: 'left' | 'right' | 'center'
  render: (row: T) => ReactNode
}

interface Props<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  empty?: ReactNode
}

export function DataTable<T>(props: Props<T>) {
  if (!props.rows.length) {
    return (
      <div className="rounded-md border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
        {props.empty ?? 'no rows'}
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-md border border-zinc-800">
      <table className="w-full table-auto border-collapse text-sm">
        <thead className="bg-zinc-900/60">
          <tr>
            {props.columns.map((c) => (
              <th
                key={c.key}
                className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-400"
                style={c.width ? { width: c.width } : undefined}
                scope="col"
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr
              key={props.rowKey(row)}
              onClick={props.onRowClick ? () => props.onRowClick!(row) : undefined}
              className={`border-t border-zinc-800 ${
                props.onRowClick
                  ? 'cursor-pointer hover:bg-zinc-900/60'
                  : 'hover:bg-zinc-900/30'
              }`}
            >
              {props.columns.map((c) => (
                <td
                  key={c.key}
                  className="px-3 py-2 align-middle text-zinc-200"
                  style={c.align === 'right' ? { textAlign: 'right' } : undefined}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPage: (n: number) => void
}

export function Pagination(props: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize))
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
      <span>
        page {props.page + 1} of {totalPages} · {props.total} total
      </span>
      <div className="flex gap-2">
        <button
          disabled={props.page === 0}
          onClick={() => props.onPage(Math.max(0, props.page - 1))}
          className="rounded-md border border-zinc-700 px-2 py-1 hover:bg-zinc-900 disabled:opacity-40"
        >
          prev
        </button>
        <button
          disabled={props.page + 1 >= totalPages}
          onClick={() => props.onPage(Math.min(totalPages - 1, props.page + 1))}
          className="rounded-md border border-zinc-700 px-2 py-1 hover:bg-zinc-900 disabled:opacity-40"
        >
          next
        </button>
      </div>
    </div>
  )
}

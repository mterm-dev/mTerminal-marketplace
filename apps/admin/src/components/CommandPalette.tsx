import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Command {
  id: string
  label: string
  hint?: string
  action: () => void
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)

  const commands = useMemo<Command[]>(
    () => [
      { id: 'dashboard', label: 'go to dashboard', action: () => navigate('/') },
      {
        id: 'extensions',
        label: 'go to extensions',
        action: () => navigate('/extensions'),
      },
      { id: 'authors', label: 'go to authors', action: () => navigate('/authors') },
      { id: 'audit', label: 'go to audit log', action: () => navigate('/audit') },
    ],
    [navigate],
  )

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(term))
  }, [q, commands])

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => {
    setIdx(0)
  }, [q])

  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-32"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIdx((i) => Math.min(filtered.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIdx((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const cmd = filtered[idx]
              if (cmd) {
                cmd.action()
                onClose()
              }
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
          placeholder="type a command…"
          className="h-12 w-full border-b border-zinc-800 bg-transparent px-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
        />
        <ul className="max-h-72 overflow-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-zinc-500">no commands</li>
          )}
          {filtered.map((c, i) => (
            <li key={c.id}>
              <button
                onClick={() => {
                  c.action()
                  onClose()
                }}
                onMouseEnter={() => setIdx(i)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                  i === idx ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300'
                }`}
              >
                <span>{c.label}</span>
                {c.hint && <span className="text-xs text-zinc-500">{c.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

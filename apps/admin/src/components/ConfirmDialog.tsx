import { useEffect } from 'react'
import { Button } from './ui'

interface Props {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  variant?: 'primary' | 'danger'
  onCancel: () => void
  onConfirm: () => void
  busy?: boolean
}

export function ConfirmDialog(props: Props) {
  useEffect(() => {
    if (!props.open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') props.onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  if (!props.open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={props.onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-100">{props.title}</h2>
        {props.description && (
          <p className="mt-2 text-sm text-zinc-400">{props.description}</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={props.onCancel} disabled={props.busy}>
            cancel
          </Button>
          <Button
            variant={props.variant ?? 'primary'}
            onClick={props.onConfirm}
            disabled={props.busy}
          >
            {props.busy ? 'working…' : (props.confirmLabel ?? 'confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}

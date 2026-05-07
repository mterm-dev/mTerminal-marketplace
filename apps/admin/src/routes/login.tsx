import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Input } from '../components/ui'
import { api, ApiError } from '../api/client'

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const error = params.get('error')
  const [devLogin, setDevLogin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    api
      .me()
      .then(() => navigate('/', { replace: true }))
      .catch(() => undefined)
  }, [navigate])

  function startGithub() {
    window.location.href = '/v1/admin/auth/github/start'
  }

  async function submitDev(e: React.FormEvent) {
    e.preventDefault()
    if (!devLogin.trim()) return
    setSubmitting(true)
    setLocalError(null)
    try {
      await api.devLogin(devLogin.trim())
      navigate('/', { replace: true })
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'dev login failed'
      setLocalError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-zinc-100">mterminal admin</h1>
        <p className="mt-1 text-sm text-zinc-400">sign in to manage the marketplace</p>

        {error === 'forbidden' && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-red-800 bg-red-900/30 p-3 text-sm text-red-200"
          >
            your github account is not on the admin allowlist.
          </div>
        )}

        <Button
          variant="primary"
          className="mt-6 w-full"
          onClick={startGithub}
          aria-label="sign in with github"
        >
          sign in with github
        </Button>

        <div className="my-6 flex items-center gap-3 text-xs text-zinc-500">
          <span className="h-px flex-1 bg-zinc-800" />
          dev login
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        <form onSubmit={submitDev} className="flex gap-2">
          <Input
            value={devLogin}
            onChange={(e) => setDevLogin(e.target.value)}
            placeholder="github login"
            aria-label="dev login github username"
            className="flex-1"
          />
          <Button type="submit" variant="secondary" disabled={submitting}>
            {submitting ? '…' : 'login'}
          </Button>
        </form>
        {localError && (
          <p role="alert" className="mt-3 text-xs text-red-300">
            {localError}
          </p>
        )}
        <p className="mt-6 text-xs text-zinc-500">
          dev login bypasses oauth and is allowlist-checked. use only in local dev.
        </p>
        <p className="mt-2 text-xs text-zinc-600">
          <Link to="/" className="underline-offset-2 hover:underline">
            return to root
          </Link>
        </p>
      </Card>
    </div>
  )
}

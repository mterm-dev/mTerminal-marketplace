import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useMe } from '../api/hooks'
import { api, setCsrfToken } from '../api/client'
import { Button } from './ui'
import { CommandPalette } from './CommandPalette'

const NAV = [
  { to: '/', label: 'dashboard', end: true },
  { to: '/extensions', label: 'extensions', end: false },
  { to: '/authors', label: 'authors', end: false },
  { to: '/audit', label: 'audit log', end: false },
]

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe()
  const navigate = useNavigate()
  const location = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    if (me.error) {
      navigate('/login', { replace: true, state: { from: location.pathname } })
    }
  }, [me.error, navigate, location.pathname])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function logout() {
    try {
      await api.logout()
    } catch {}
    setCsrfToken(null)
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-6 backdrop-blur">
        <div className="flex items-center gap-8">
          <Link
            to="/"
            className="text-sm font-semibold text-zinc-100 hover:text-white"
            aria-label="mterminal admin home"
          >
            mterminal · admin
          </Link>
          <nav className="flex items-center gap-1" aria-label="primary">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPaletteOpen(true)}
            aria-label="open command palette"
          >
            <span className="text-zinc-500">cmd+k</span>
          </Button>
          {me.data && (
            <span className="text-xs text-zinc-400" aria-label="signed in user">
              {me.data.login}
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={logout}>
            logout
          </Button>
        </div>
      </header>
      <main className="flex-1 px-6 py-6">{children}</main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

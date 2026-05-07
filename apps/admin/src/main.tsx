import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { App } from './App'
import './index.css'

const LoginPage = lazy(() =>
  import('./routes/login').then((m) => ({ default: m.LoginPage })),
)
const DashboardPage = lazy(() =>
  import('./routes/dashboard').then((m) => ({ default: m.DashboardPage })),
)
const ExtensionsListPage = lazy(() =>
  import('./routes/extensions-list').then((m) => ({
    default: m.ExtensionsListPage,
  })),
)
const ExtensionDetailPage = lazy(() =>
  import('./routes/extension-detail').then((m) => ({
    default: m.ExtensionDetailPage,
  })),
)
const AuthorsPage = lazy(() =>
  import('./routes/authors').then((m) => ({ default: m.AuthorsPage })),
)
const AuditPage = lazy(() =>
  import('./routes/audit').then((m) => ({ default: m.AuditPage })),
)

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">
      loading…
    </div>
  )
}

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('root not found')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter basename="/admin">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<App />}>
              <Route index element={<DashboardPage />} />
              <Route path="extensions" element={<ExtensionsListPage />} />
              <Route path="extensions/:id" element={<ExtensionDetailPage />} />
              <Route path="authors" element={<AuthorsPage />} />
              <Route path="audit" element={<AuditPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

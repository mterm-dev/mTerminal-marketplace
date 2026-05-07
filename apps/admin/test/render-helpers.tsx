import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

export function renderWithProviders(
  ui: ReactNode,
  initialEntries: string[] = ['/'],
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: 0 } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

export function mockFetch(responses: Record<string, unknown>) {
  const stub = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    for (const [pat, body] of Object.entries(responses)) {
      if (url.includes(pat)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
    }
    return new Response(JSON.stringify({ error: 'not mocked' }), { status: 404 })
  }
  return stub as unknown as typeof fetch
}

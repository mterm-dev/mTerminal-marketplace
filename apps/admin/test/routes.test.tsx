import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { mockFetch, renderWithProviders } from './render-helpers'
import { LoginPage } from '../src/routes/login'
import { DashboardPage } from '../src/routes/dashboard'
import { ExtensionsListPage } from '../src/routes/extensions-list'
import { ExtensionDetailPage } from '../src/routes/extension-detail'
import { AuthorsPage } from '../src/routes/authors'
import { AuditPage } from '../src/routes/audit'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('login page', () => {
  it('renders and offers a github sign-in button', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/v1/admin/me': { error: 'unauthorized' },
      }),
    )
    renderWithProviders(<LoginPage />, ['/login'])
    expect(screen.getByText(/mterminal admin/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /sign in with github/i })).toBeDefined()
  })
})

describe('dashboard page', () => {
  it('renders metric cards once data resolves', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/v1/admin/dashboard': {
          extensionsTotal: 7,
          versionsTotal: 21,
          authorsTotal: 4,
          downloadsLast7d: 999,
          pendingReports: 0,
          topExtensions: [
            { id: 'a', displayName: 'A', downloadTotal: 50 },
          ],
          recentVersions: [
            { extId: 'a', version: '1.0.0', publishedAt: Date.now(), sizeBytes: 1024 },
          ],
        },
      }),
    )
    renderWithProviders(<DashboardPage />)
    await waitFor(() => expect(screen.getByText(/^7$/)).toBeDefined())
    expect(screen.getByText(/top extensions/i)).toBeDefined()
    expect(screen.getByText(/recent versions/i)).toBeDefined()
  })
})

describe('extensions list page', () => {
  it('renders empty filter state', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/v1/admin/extensions': {
          items: [],
          total: 0,
          page: 0,
          pageSize: 40,
        },
      }),
    )
    renderWithProviders(<ExtensionsListPage />, ['/extensions'])
    expect(screen.getByText(/^extensions$/i)).toBeDefined()
    expect(screen.getByLabelText(/^search$/i)).toBeDefined()
    await waitFor(() =>
      expect(screen.getByText(/no extensions match the filters/i)).toBeDefined(),
    )
  })

  it('lists rows when api returns items', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/v1/admin/extensions': {
          items: [
            {
              id: 'foo',
              displayName: 'Foo',
              description: '',
              category: 'productivity',
              iconUrl: null,
              authorId: 'gh-1',
              authorLogin: 'octocat',
              latestVersion: '1.0.0',
              downloadTotal: 42,
              curated: true,
              recommended: false,
              avgStars: 4.5,
              ratingCount: 3,
              versionCount: 1,
              updatedAt: Date.now(),
            },
          ],
          total: 1,
          page: 0,
          pageSize: 40,
        },
      }),
    )
    renderWithProviders(<ExtensionsListPage />, ['/extensions'])
    await waitFor(() => expect(screen.getByText('Foo')).toBeDefined())
    expect(screen.getByText('octocat')).toBeDefined()
    expect(screen.getByText('curated')).toBeDefined()
  })
})

describe('extension detail page', () => {
  it('renders extension fields and version list', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/v1/admin/extensions/foo': {
          id: 'foo',
          displayName: 'Foo',
          description: 'a foo extension',
          category: 'other',
          iconUrl: null,
          homepageUrl: null,
          repoUrl: null,
          authorId: 'gh-1',
          authorLogin: 'octocat',
          latestVersion: '1.0.0',
          downloadTotal: 10,
          curated: false,
          recommended: false,
          avgStars: null,
          ratingCount: 0,
          versionCount: 1,
          updatedAt: Date.now(),
          createdAt: Date.now() - 100000,
          versions: [
            {
              version: '1.0.0',
              apiRange: '^1.0.0',
              sizeBytes: 2048,
              sha256: '1234567890abcdef',
              keyId: 'gh-1:key1',
              yanked: false,
              publishedAt: Date.now(),
            },
          ],
          ratings: [],
        },
      }),
    )
    renderWithProviders(
      <Routes>
        <Route path="/extensions/:id" element={<ExtensionDetailPage />} />
      </Routes>,
      ['/extensions/foo'],
    )
    await waitFor(() => expect(screen.getByText('a foo extension')).toBeDefined())
    expect(screen.getByText(/mark curated/i)).toBeDefined()
    expect(screen.getAllByText('1.0.0').length).toBeGreaterThan(0)
  })
})

describe('authors page', () => {
  it('renders authors with action buttons', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/v1/admin/authors': {
          items: [
            {
              id: 'gh-1',
              githubLogin: 'octocat',
              banned: false,
              createdAt: Date.now(),
              extensionsCount: 2,
              totalDownloads: 5,
            },
          ],
          total: 1,
          page: 0,
          pageSize: 40,
        },
      }),
    )
    renderWithProviders(<AuthorsPage />, ['/authors'])
    await waitFor(() => expect(screen.getByText('octocat')).toBeDefined())
    expect(screen.getAllByText(/^ban$/i).length).toBeGreaterThan(0)
  })
})

describe('audit page', () => {
  it('renders empty audit log', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/v1/admin/audit': { items: [], total: 0, page: 0, pageSize: 50 },
      }),
    )
    renderWithProviders(<AuditPage />, ['/audit'])
    expect(screen.getByText(/audit log/i)).toBeDefined()
    await waitFor(() => expect(screen.getByText(/no audit entries yet/i)).toBeDefined())
  })

  it('renders audit entries', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        '/v1/admin/audit': {
          items: [
            {
              id: 1,
              adminLogin: 'arthurr0',
              action: 'extension.update',
              target: 'foo',
              payload: { curated: true },
              createdAt: Date.now(),
            },
          ],
          total: 1,
          page: 0,
          pageSize: 50,
        },
      }),
    )
    renderWithProviders(<AuditPage />, ['/audit'])
    await waitFor(() => expect(screen.getByText('arthurr0')).toBeDefined())
    expect(screen.getByText('extension.update')).toBeDefined()
  })
})

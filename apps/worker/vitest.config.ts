import path from 'node:path'
import { defineWorkersProject, readD1Migrations } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersProject(async () => {
  const migrations = await readD1Migrations(
    path.resolve(__dirname, 'src/db/migrations'),
  )
  return {
    test: {
      setupFiles: ['./test/apply-migrations.ts', './test/setup.ts'],
      poolOptions: {
        workers: {
          singleWorker: true,
          isolatedStorage: true,
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            d1Databases: ['DB'],
            r2Buckets: ['PACKAGES'],
            kvNamespaces: ['SESSIONS'],
            compatibilityDate: '2024-11-12',
            compatibilityFlags: ['nodejs_compat'],
            bindings: {
              TEST_MIGRATIONS: migrations,
              ADMIN_LOGINS: 'admin-tester,arthurr0',
              ADMIN_GITHUB_CLIENT_ID: 'test-client-id',
              ADMIN_GITHUB_CLIENT_SECRET: 'test-secret',
              ADMIN_BASE_URL: 'http://test.local',
              ADMIN_DEV_LOGIN: '1',
              GITHUB_CLIENT_ID: 'test-client-id',
              PUBLIC_R2_BASE: 'http://test.local/r2',
              SIGNED_URL_TTL_SEC: '300',
            },
          },
        },
      },
    },
  }
})

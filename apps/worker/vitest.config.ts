import { defineWorkersProject } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersProject({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          d1Databases: ['DB'],
          r2Buckets: ['PACKAGES'],
          kvNamespaces: ['SESSIONS'],
          compatibilityDate: '2024-11-12',
          compatibilityFlags: ['nodejs_compat'],
        },
      },
    },
  },
})

# mterminal-marketplace

Marketplace backend, CLI, and shared packages for mTerminal extensions.

## structure

```
apps/
  worker/                   cloudflare workers backend (hono + d1 + r2 + kv)
packages/
  marketplace-types/        shared dto (@mterminal/marketplace-types)
  manifest-validator/       shared manifest validator (@mterminal/manifest-validator)
  mtx-cli/                  author cli published as `mtx`
.github/workflows/
  ci.yml                    install + build + test on every push
  deploy-worker.yml         wrangler deploy on tag worker-v*
  publish-packages.yml      changesets release on tag pkg-v*
```

## prerequisites

- node >= 22
- pnpm 9
- wrangler (`pnpm dlx wrangler --version` works without global install)

## quickstart

```bash
pnpm install
pnpm -r build
pnpm -r test
```

## worker dev loop

```bash
cd apps/worker
pnpm wrangler d1 migrations apply mterminal --local
pnpm dev
```

The worker listens on `http://127.0.0.1:8787`. D1 binding is `DB`, R2 binding is `PACKAGES`, KV binding is `SESSIONS`.

## smoke test

End-to-end cycle init → keygen → pack → publish against a running local worker:

```bash
pnpm dev:worker &
pnpm smoke
```

The smoke script defaults to `MTX_ENDPOINT=http://127.0.0.1:8787`. Override it to point at a deployed environment.

## test layout

- `apps/worker/test/` — vitest under `@cloudflare/vitest-pool-workers`. D1 schema is loaded from `src/db/migrations/` via `readD1Migrations` (single source of truth).
- `packages/manifest-validator/src/index.test.ts` — pure unit tests.
- `packages/mtx-cli/src/lib/*.test.ts` — pure unit tests with stubbed fetch and tmp filesystems.

## publishing flow (author)

```bash
pnpm --filter @mterminal/mtx run build
node packages/mtx-cli/bin/mtx.mjs login
node packages/mtx-cli/bin/mtx.mjs keygen
node packages/mtx-cli/bin/mtx.mjs init my-extension
cd my-extension
mtx pack
mtx publish
```

## license

MIT

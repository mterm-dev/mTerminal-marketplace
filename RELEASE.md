# RELEASE.md

How to ship a release of the mTerminal marketplace.

There are **three independent release artifacts** in this repo:

1. **npm packages** — `@mterminal/marketplace-types`, `@mterminal/manifest-validator`, `mtx` (the CLI).
2. **The Cloudflare Worker** — the marketplace API + admin SPA (admin SPA is bundled into the worker via the `[assets]` binding).
3. **The admin SPA** — currently always shipped *with* the worker. There is no separate admin release.

Each has its own tag prefix and workflow. Authors of extensions release through `~/code/mterminal-extensions/` and its own `publish.yml`.

---

## 1. Releasing npm packages (`pkg-v*`)

Use this when you bump the version of any of the public npm packages.

1. Open a PR that updates `package.json` versions for the affected packages. If using Changesets (see [`DEPLOY.md` §8](./DEPLOY.md#one-time-changesets-setup-optional-but-recommended)), include a changeset file.
2. Wait for `ci.yml` to go green.
3. Merge to `main`.
4. Tag and push:
   ```bash
   git tag pkg-v0.1.1
   git push origin pkg-v0.1.1
   ```
5. `publish-packages.yml` runs and publishes all three packages to npm with `--access public`.
6. Verify on npm:
   ```bash
   npm view mtx versions
   npm view @mterminal/marketplace-types versions
   npm view @mterminal/manifest-validator versions
   ```

> The same tag publishes **all three packages**. If you only want to release one, bump only that one's version — npm rejects re-publishes of the same `name@version`, so the other two will fail their publish step harmlessly. (Cleaner alternative: split tag prefixes per package — open an issue if needed.)

---

## 2. Releasing the worker (`worker-v*` or manual)

1. Land all worker changes on `main`. CI must be green.
2. Either:
   - **Tag-driven:**
     ```bash
     git tag worker-v0.2.0
     git push origin worker-v0.2.0
     ```
   - **Manual dispatch:** `Actions → deploy-worker → Run workflow → Branch: main`.
3. `deploy-worker.yml`:
   - builds all packages (`pnpm -r build`),
   - builds the admin SPA (`pnpm --filter @mterminal/admin build`),
   - runs `wrangler deploy --env production`,
   - smoke-tests `https://marketplace.mterminal.dev/healthz`,
   - pings `DEPLOY_WEBHOOK_URL` if configured.
4. Verify:
   ```bash
   curl -fsS https://marketplace.mterminal.dev/healthz
   ```

For the rollback path, see [`DEPLOY.md` §4](./DEPLOY.md#4-rollback).

---

## 3. Releasing the admin SPA

The admin SPA ships **inside** the worker deploy via the `[assets]` binding. To release admin-only changes:

1. Land the admin changes on `main`.
2. Cut a `worker-v*` tag (or trigger `deploy-worker` manually). The admin `dist/` is rebuilt as part of the deploy job.

There is no separate `admin-v*` tag.

---

## 4. Pre-flight checklist

Before any production deploy:

- [ ] CI green on the commit being deployed.
- [ ] D1 migrations are idempotent and have been tested with `--local` first.
- [ ] If you added a new env var or secret, both `wrangler.toml` and Cloudflare secrets are updated **before** the deploy (or the deploy will run with the old config and 500 on requests that touch the new code path).
- [ ] If you bumped the package versions, the `pkg-v*` tag has already been pushed and `publish-packages.yml` has succeeded — otherwise the worker may reference types/validators that aren't on npm yet.
- [ ] `DEPLOY.md` and `RELEASE.md` reflect any process change.

---

## 5. Hotfix flow

1. Branch from `main` → `hotfix/<short-name>`.
2. Make the minimal fix + test.
3. Open PR, get CI green, merge.
4. Cut `worker-v<patch>` immediately. No need to bundle other changes.

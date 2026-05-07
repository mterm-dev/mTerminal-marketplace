# DEPLOY.md

Production runbook for the mTerminal marketplace (Cloudflare Workers + D1 + R2 + KV) plus the admin SPA shipped as worker assets.

This document is the canonical reference for the **first-time** production bring-up and for **routine operational tasks** (rollback, secret rotation, audit). It assumes you have shell access to the repo and `pnpm` 9, Node 22, and `wrangler` 3 installed.

---

## 1. One-time setup

### 1.1 Required accounts and one-time configuration

#### Cloudflare

1. Create (or reuse) a Cloudflare account that owns the `mterminal.app` zone.
2. Install the Wrangler CLI globally or use the workspace copy:
   ```bash
   pnpm dlx wrangler --version
   ```
3. Authenticate:
   ```bash
   wrangler login
   ```
   This opens a browser tab and stores an OAuth token in `~/.wrangler/`.
4. Note the **Account ID** (top-right of the Cloudflare dashboard) — it goes into `CLOUDFLARE_ACCOUNT_ID` for CI.
5. Create an API token at **My Profile → API Tokens → Create Token** with template **"Edit Cloudflare Workers"** plus the `D1`, `R2`, `Workers KV Storage`, and `Workers Routes` permissions for the zone. Save as `CLOUDFLARE_API_TOKEN` in GitHub secrets.

#### GitHub OAuth Apps (two distinct apps)

The worker performs OAuth in **two flows** that need separate apps:

**App A — author CLI (device flow)**

- GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**
- Application name: `mTerminal Marketplace CLI (prod)`
- Homepage URL: `https://marketplace.mterminal.app`
- Authorization callback URL: `https://marketplace.mterminal.app/v1/auth/github/callback`
- Enable **Device Flow** (checkbox at the bottom of the app page).
- Save the **Client ID** → `GITHUB_CLIENT_ID` (vars).
- Generate a new client secret → `GITHUB_CLIENT_SECRET` (wrangler secret).

**App B — admin web SPA**

- New OAuth App (separate from A).
- Application name: `mTerminal Marketplace Admin (prod)`
- Homepage URL: `https://marketplace.mterminal.app/admin`
- Authorization callback URL: `https://marketplace.mterminal.app/v1/admin/auth/github/callback`
- **Do not** enable device flow.
- Save **Client ID** → `ADMIN_GITHUB_CLIENT_ID` (vars).
- Generate client secret → `ADMIN_GITHUB_CLIENT_SECRET` (wrangler secret).

Repeat the whole thing for **staging** with separate apps (`-staging` callback URLs).

#### Domain

1. Add `mterminal.app` to Cloudflare DNS (already required for Workers Routes).
2. The worker's `[env.production] [[routes]]` entry binds `marketplace.mterminal.app/*` — Cloudflare auto-provisions DNS once the route is published. No manual A/CNAME record needed for the worker subdomain.
3. For staging, the same applies for `staging.marketplace.mterminal.app/*`.

### 1.2 Creating Cloudflare resources

Run these from `apps/worker/`. **Save every ID printed by these commands** — they go into `wrangler.toml`.

#### Production

```bash
cd apps/worker

# D1 database
wrangler d1 create mterminal-prod
# -> copy `database_id` into wrangler.toml > [[env.production.d1_databases]] > database_id

# Apply migrations (currently 0001_init.sql, 0002_admin.sql; add 0003 when introduced)
wrangler d1 migrations apply mterminal-prod --remote --env production

# R2 bucket
wrangler r2 bucket create mterminal-packages-prod

# KV namespace for sessions
wrangler kv namespace create SESSIONS --env production
# -> copy `id` into wrangler.toml > [[env.production.kv_namespaces]] > id
```

#### Staging

```bash
wrangler d1 create mterminal-staging
wrangler d1 migrations apply mterminal-staging --remote --env staging
wrangler r2 bucket create mterminal-packages-staging
wrangler kv namespace create SESSIONS --env staging
```

After every `create` command, **edit `apps/worker/wrangler.toml`** and replace the corresponding `REPLACE_WITH_*` placeholder. Commit the change before the first deploy.

### 1.3 Secrets

Each secret must be set per environment. **Never commit secrets to git** — they live only in Cloudflare and (when needed) in GitHub Actions secrets.

```bash
cd apps/worker

# CLI / author OAuth client secret
wrangler secret put GITHUB_CLIENT_SECRET --env production

# Admin SPA OAuth client secret
wrangler secret put ADMIN_GITHUB_CLIENT_SECRET --env production

# Admin allow-list (comma-separated GitHub logins)
wrangler secret put ADMIN_LOGINS --env production
# -> example value: arthurr0,jane
```

Repeat for `--env staging`.

#### Full secret inventory

| Secret name                     | Set via                       | Purpose                                              | Rotate          |
|---------------------------------|-------------------------------|------------------------------------------------------|-----------------|
| `GITHUB_CLIENT_SECRET`          | `wrangler secret put`         | exchange device code for github user info            | every 90 days   |
| `ADMIN_GITHUB_CLIENT_SECRET`    | `wrangler secret put`         | exchange admin web auth code                         | every 90 days   |
| `ADMIN_LOGINS`                  | `wrangler secret put` (CSV)   | who can sign into the admin SPA                      | on team change  |
| `CLOUDFLARE_API_TOKEN`          | GitHub repo secret            | CI uses this to deploy                               | every 90 days   |
| `CLOUDFLARE_ACCOUNT_ID`         | GitHub repo variable          | CI account binding (not sensitive but needed)        | n/a             |
| `NPM_TOKEN`                     | GitHub repo secret            | publish-packages.yml publishes mtx + types to npm    | every 180 days  |
| `DEPLOY_WEBHOOK_URL` (optional) | GitHub repo variable          | Slack/Discord notification on deploy success/fail    | as needed       |

Rotation procedure for each is documented in [Secret rotation](#7-secret-rotation).

### 1.4 wrangler.toml verification

`apps/worker/wrangler.toml` ships with `[env.staging]` and `[env.production]` sections. After running step 1.2, verify each section has:

- `[env.<env>] name` set (so the worker name is unique per env).
- `[env.<env>.vars]` block with `GITHUB_CLIENT_ID`, `ADMIN_GITHUB_CLIENT_ID`, `ADMIN_LOGINS`, `ADMIN_DEV_LOGIN = "0"`, `PUBLIC_R2_BASE`, `SIGNED_URL_TTL_SEC`.
- `[[env.<env>.d1_databases]]` with the `database_id` you saved from step 1.2.
- `[[env.<env>.r2_buckets]]` with `bucket_name`.
- `[[env.<env>.kv_namespaces]]` with `id`.
- `[[env.<env>.routes]]` for `marketplace.mterminal.app/*` (or `staging.marketplace.mterminal.app/*`).
- `[env.<env>.assets]` pointing at `../admin/dist` so the admin SPA is bundled into the deploy.

**Important:** `ADMIN_DEV_LOGIN` MUST be `"0"` in production. With `"1"`, `/v1/auth/device/dev-authorize` and equivalent admin shortcuts are enabled — that's only for local dev / smoke tests.

---

## 2. Build and deploy

### 2.1 Build

```bash
# from the repo root
pnpm install --frozen-lockfile
pnpm -r build
pnpm --filter @mterminal/admin build
```

The admin SPA's `dist/` is consumed by the worker via the `[assets]` binding.

### 2.2 Deploy to staging

```bash
pnpm --filter @mterminal/worker exec wrangler deploy --env staging
```

### 2.3 Deploy to production

```bash
pnpm --filter @mterminal/worker exec wrangler deploy --env production
```

### 2.4 Smoke test

```bash
curl -fsS https://marketplace.mterminal.app/healthz
# expected: {"ok":true,...}
```

For a richer end-to-end check (device flow + pack + publish), run `scripts/smoke.sh` against the staging endpoint:

```bash
MTX_ENDPOINT=https://staging.marketplace.mterminal.app pnpm smoke
```

(Don't run `smoke.sh` against prod — it depends on `ADMIN_DEV_LOGIN=1` for `dev-authorize`.)

---

## 3. Custom domain config

The route binding in `wrangler.toml` is sufficient. To verify:

1. Cloudflare dashboard → **Workers & Pages → mterminal-marketplace-prod → Triggers**.
2. **Custom Domains** should list `marketplace.mterminal.app`. If not, click **Add Custom Domain** and confirm — Cloudflare provisions the cert automatically.
3. DNS for `mterminal.app` must be managed by Cloudflare (orange-cloud proxied).

---

## 4. Rollback

Cloudflare keeps deployment history per worker.

```bash
# list recent deployments
wrangler deployments list --env production

# roll back to the previous deployment (interactive picker)
wrangler rollback --env production --message "rollback: <reason>"
```

D1 schema migrations are **not** rolled back automatically. If a bad migration shipped:

1. Add a new migration (e.g. `0004_revert_xxx.sql`) that undoes the change.
2. Apply with `wrangler d1 migrations apply mterminal-prod --remote --env production`.
3. Then `wrangler rollback` the worker.

D1 has **no point-in-time recovery**. Daily backups are mandatory — see [§6 Database backups](#6-database-backups).

---

## 5. Operations runbook

### Audit log

```bash
wrangler d1 execute mterminal-prod --remote --env production \
  --command "SELECT * FROM admin_audit ORDER BY created_at DESC LIMIT 50"
```

### Yank a published version

Either through the admin SPA (preferred) or directly:

```bash
wrangler d1 execute mterminal-prod --remote --env production \
  --command "UPDATE versions SET yanked = 1, yanked_reason = 'CVE-xxxx-xxxx' WHERE ext_id = 'foo' AND version = '1.2.3'"
```

Always pair with an entry in `admin_audit` (`actor='manual', action='yank', target_id=...`).

### R2 storage usage

```bash
wrangler r2 bucket info mterminal-packages-prod
```

Listing objects (top 100):

```bash
wrangler r2 object list mterminal-packages-prod --limit 100
```

### Tail logs

```bash
wrangler tail --env production --format pretty
```

### Inspect KV (sessions)

```bash
wrangler kv key list --binding SESSIONS --env production --remote
```

Sessions auto-expire (TTL is set on write); deleting a key force-logs-out a single user.

---

## 6. Database backups

D1 lacks point-in-time recovery. Schedule daily exports with the GitHub Action `.github/workflows/d1-backup.yml` (placeholder — see [§9 TODO](#9-todo)).

Manual backup:

```bash
wrangler d1 export mterminal-prod --remote --env production --output backups/mterminal-prod-$(date +%Y%m%d).sql
```

Retention target: **30 days** rolling. Store under `s3://mterminal-backups/d1/` (or any external R2 bucket that is **not** the same project).

Restore (full, into a new database):

```bash
wrangler d1 create mterminal-prod-restore
wrangler d1 execute mterminal-prod-restore --remote --file backups/mterminal-prod-YYYYMMDD.sql
# then point wrangler.toml at the new database_id and redeploy
```

---

## 7. Secret rotation

### GitHub OAuth client secrets (every 90 days)

For both `GITHUB_CLIENT_SECRET` and `ADMIN_GITHUB_CLIENT_SECRET`:

1. **GitHub → Settings → Developer settings → OAuth Apps → (the app) → Generate a new client secret.**
2. Copy the new secret.
3. `wrangler secret put GITHUB_CLIENT_SECRET --env production` (paste when prompted).
4. After the secret update propagates (Workers picks it up on the next request — no redeploy needed) confirm with a fresh device flow / admin login.
5. **Revoke the old secret** in GitHub.

### `ADMIN_LOGINS`

Edit the CSV and re-put:

```bash
wrangler secret put ADMIN_LOGINS --env production
# enter: arthurr0,newperson
```

Propagates on the next request. Removed users are locked out as soon as their session KV key expires (default TTL) or is deleted manually.

### `CLOUDFLARE_API_TOKEN` (every 90 days)

1. Cloudflare dashboard → **My Profile → API Tokens** → roll the token.
2. GitHub → **Repo → Settings → Secrets and variables → Actions** → update `CLOUDFLARE_API_TOKEN`.
3. Delete the old token after the next successful CI deploy.

### `NPM_TOKEN` (every 180 days)

1. npm → **Access Tokens** → generate a new automation token (scope: publish to `@mterminal/*` and `mtx`).
2. GitHub repo secret → update `NPM_TOKEN`.
3. Delete old.

### Author API keys (issued via device flow)

Authors rotate their own keys via the CLI:

```bash
mtx keygen --name <name>           # adds a new active key
mtx keys list                      # shows fingerprints
mtx keys revoke <keyId>            # marks server-side as revoked
```

> **TODO:** `mtx keys list` and `mtx keys revoke` are not yet implemented in `packages/mtx-cli/`. Track in [§9 TODO](#9-todo). For now, revoke directly in D1: `UPDATE author_keys SET revoked_at = strftime('%s','now') WHERE key_id = ?`.

---

## 8. CI/CD overview

| Workflow                                          | Trigger                          | Effect                                                  |
|---------------------------------------------------|----------------------------------|---------------------------------------------------------|
| `.github/workflows/ci.yml`                        | every push / PR                  | install + build + typecheck + test                      |
| `.github/workflows/deploy-worker.yml`             | push tag `worker-v*` or manual   | deploy worker (admin SPA bundled) to production         |
| `.github/workflows/publish-packages.yml`          | push tag `pkg-v*`                | publish `@mterminal/marketplace-types`, `@mterminal/manifest-validator`, `mtx` to npm |

The release flow is described in [`RELEASE.md`](./RELEASE.md).

### One-time Changesets setup (optional but recommended)

Changesets gives PR-based version management for the npm packages.

```bash
pnpm dlx @changesets/cli init
# commits .changeset/config.json + a README in .changeset/
```

After `init`, replace the body of `.github/workflows/publish-packages.yml` with the standard `changesets/action@v1` flow if you want PR-driven releases. The current workflow uses raw tag-driven `pnpm publish` and works without Changesets.

---

## 9. TODO

- [ ] Add `0003_*` migration if/when the marketplace schema needs another change. Currently migrations stop at `0002_admin.sql`.
- [ ] Add `.github/workflows/d1-backup.yml` running on schedule (`cron: '0 3 * * *'`) that exports D1 and uploads to a backup R2 bucket.
- [ ] Implement `mtx keys list` and `mtx keys revoke <keyId>` in `packages/mtx-cli/` so authors can rotate without DB access.
- [ ] Wire `marketplace-integration.yml` (in `~/code/mTerminal/.github/workflows/`) to checkout this repo as a sibling, run `wrangler dev` against an ephemeral D1 + R2, and execute the `MARKETPLACE_E2E=1` integration tests. The current file is a stub.
- [ ] Set up Slack/Discord webhook for deploy notifications and add the URL as a `DEPLOY_WEBHOOK_URL` repo variable.

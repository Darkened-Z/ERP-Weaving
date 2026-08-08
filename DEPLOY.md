# Deploy Guide

Ships to Vercel + Turso. All commands run from `app/`.

## 1 · Turso database

Install CLI (once):
```bash
curl -sSfL https://get.tur.so/install.sh | bash
```

Create DB:
```bash
turso auth login
turso db create sk-mills
turso db show sk-mills --url          # → TURSO_DATABASE_URL
turso db tokens create sk-mills       # → TURSO_AUTH_TOKEN
```

## 2 · Push local data to Turso

```bash
export TURSO_DATABASE_URL=libsql://sk-mills-<org>.turso.io
export TURSO_AUTH_TOKEN=<token>
node push-to-turso.mjs
```

Script drops-and-recreates every table (schema + data + indexes). Takes ~30–60s for our seeded DB.

Verify at `https://<db-url>` in the Turso dashboard.

## 3 · Vercel project

```bash
npm i -g vercel
vercel                                # first run: creates project, links directory
```

In Vercel dashboard → Project → Settings → Environment Variables, add for **Production**, **Preview**, and **Development**:

| Name | Value |
|---|---|
| `TURSO_DATABASE_URL` | from step 1 |
| `TURSO_AUTH_TOKEN` | from step 1 |
| `SESSION_SECRET` | run `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | `https://<project>.vercel.app` (Production), leave blank for Preview |

Redeploy after setting env vars:
```bash
vercel --prod
```

## 4 · Custom domain

Vercel dashboard → Project → Settings → Domains → Add. Point your DNS's A/CNAME as instructed. Update `NEXT_PUBLIC_APP_URL` to match the custom domain.

## 5 · Post-deploy checks

- Log in with a seeded admin account (see `src/db/seed.ts`)
- Command palette `Ctrl+K` returns tickets/contracts/accounts
- Live Production Board `/production/board` reads production data
- Create a test ticket → assign to yourself → verify in Team Workload
- QR sticker page `/weaving/beams/qr` — scan a printed sticker with your phone, confirms URL resolves to the beam detail

## Ongoing

Schema changes:
1. Edit `src/db/schema.ts`
2. Write a `migrate-*.mjs` script that does `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN`
3. Run once locally, once against Turso (`TURSO_DATABASE_URL=... node migrate-*.mjs`)

Never run destructive migrations against Turso without a `turso db shell` backup first.

## Rollback

Vercel: dashboard → Deployments → previous → **Promote to Production**. Zero-downtime.

Turso: no automatic rollback. Keep the last known-good `data.db` locally as a backup; re-push via `push-to-turso.mjs` if needed.

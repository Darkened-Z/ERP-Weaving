# Deploy Guide

Ships to Vercel + Turso. Commands run from `app/`.

## Where it runs

| Site | Vercel project | Data |
|---|---|---|
| https://sk-mills.vercel.app | `sk-mills` (account darkenedz1) | Turso `sk-mills` (live mill data) |
| https://erp-weaving.vercel.app | `erp-weaving` (account darkenedz1) | `demo/demo.db`, made-up sample data (`DEMO_DB=1`, no DB keys) |

Both projects build from GitHub `darkenedZ1/SK-Mills`, branch `main`.

## Ship a change

```bash
git push skmills main
```

That one push deploys both sites. Also push the mirrors:

```bash
git push origin main
```

```bash
git push demo main
```

- Vercel Hobby only builds commits **authored by the account owner**, so this repo's local git identity must stay `darkenedZ1` (GitHub noreply address).
- `npm run build` runs the regression tests (`npm test`) first; a failing test stops the deploy.
- Check both deployments reached READY (Vercel dashboard, or `vercel api "/v6/deployments?projectId=<id>&limit=1" -Q D:/Softwares/Weaving/.vercel-skmills`). A push event has been dropped before.
- Fallback for production only: `bash D:/Softwares/Weaving/deploy-skmills.sh` (deploys from a clean `git archive` with the darkenedz1 CLI).

## Environment variables

| Name | sk-mills | erp-weaving |
|---|---|---|
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | set | **never set** |
| `SESSION_SECRET` | own value | own value — must differ from sk-mills (tokens carry the role) |
| `NEXT_PUBLIC_APP_URL` | site URL | site URL |
| `DEMO_DB` | — | `1` |

Turso credentials for local scripts live in `app/.env.turso` (gitignored). Keep them out of `.env.local` so `npm run dev` never touches production.

## Schema changes

1. Edit `src/db/schema.ts`.
2. Write a `migrate-*.mjs` script (`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN`, idempotent).
3. Run it locally, then once against Turso with `node --env-file=.env.turso migrate-xyz.mjs`.
4. Rebuild the demo database (`./node_modules/.bin/tsx demo/build-demo-db.ts`) or the demo breaks; re-scan it for client names and phone numbers.

Take a backup first (Settings → Backup, or `/api/backup`) before anything destructive on Turso.

## Rollback

- Vercel: dashboard → Deployments → previous → **Promote to Production**.
- Turso: restore a backup snapshot into a NEW local file with `npm run restore-backup -- backup.json.gz NEW.db`, inspect, then decide. There is no automatic rollback.
